'use client';

import Image from "next/image";
import { useState, useEffect, useCallback, useRef, useReducer, useMemo } from "react";

import superagent from 'superagent';
import { useTeam } from '@/contexts/TeamContext';
import { useRouter } from 'next/navigation';
import { Message } from '@/lib/types';
import { getPhaseInstruction, getNextPhase, generatePrompt } from '@/lib/prompts';

// Web Speech APIの型定義
interface GoogleGenerativeAI {
  getGenerativeModel: (config: { model: string }) => {
    generateContentStream: (params: {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      generationConfig: {
        temperature: number;
        topK: number;
        topP: number;
        maxOutputTokens: number;
      };
    }) => Promise<{ stream: AsyncIterable<{ text: () => string }> }>;
  };
}

// Web Speech APIの型定義
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

// Windowインターフェースの拡張
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}



// メッセージの初期状態
const initialMessageState = {
  messages: [] as Message[],
};

// メッセージの状態を管理するreducer
function messageReducer(state: typeof initialMessageState, action: { type: string; message?: Message }) {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.message!],
      };
    default:
      return state;
  }
}

export default function ChatPage() {
  const { members, currentPhase, goToNextSpeaker, setCurrentPhase } = useTeam();
  const router = useRouter();
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [userMessage, setUserMessage] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [messageState, messageDispatch] = useReducer(messageReducer, initialMessageState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [genAI, setGenAI] = useState<GoogleGenerativeAI | null>(null);
  const [streamingResponse, setStreamingResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Gemini APIの初期化（遅延読み込み）
  useEffect(() => {
    const initializeGeminiAI = async () => {
      if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
        setError('Gemini API key is not set');
        return;
      }

      try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        setGenAI(new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY));
      } catch (error) {
        console.error('Failed to load GoogleGenerativeAI:', error);
        setError('AI機能の読み込みに失敗しました');
      }
    };

    initializeGeminiAI();
  }, []);

  // メンバー情報がない場合は登録ページにリダイレクト
  useEffect(() => {
    if (members.length === 0) {
      router.replace('/setup');
    }
  }, [members, router]);



  // 音声合成
  const speakText = useCallback(async (text: string) => {
    if (!text) return;

    const audioObjects: { audio: HTMLAudioElement; url: string }[] = [];

    try {
      setIsSpeaking(true);

      // テキストを文単位で分割
      const sentences = text
        .split(/[。！？\n]/)
        .map(s => s.trim())
        .filter(s => s !== '');

      // 各文を順番に処理
      for (const sentence of sentences) {
        try {
          // 音声データの取得
          const response = await superagent
            .post('/api/tts')
            .send({ text: sentence })
            .responseType('blob');

          // 音声の再生と完了待ち
          await new Promise<void>((resolve, reject) => {
            const audio = new Audio();
            const audioUrl = URL.createObjectURL(response.body);
            audio.src = audioUrl;

            audioObjects.push({ audio, url: audioUrl });

            // 再生開始
            const playPromise = audio.play();
            if (playPromise !== undefined) {
              playPromise.catch(reject);
            }

            // 再生完了時の処理
            const handleEnded = () => {
              audio.removeEventListener('ended', handleEnded);
              audio.removeEventListener('error', handleError);
              URL.revokeObjectURL(audioUrl);
              resolve();
            };

            // エラー時の処理
            const handleError = (error: Event) => {
              audio.removeEventListener('ended', handleEnded);
              audio.removeEventListener('error', handleError);
              URL.revokeObjectURL(audioUrl);
              reject(error);
            };

            audio.addEventListener('ended', handleEnded);
            audio.addEventListener('error', handleError);
          });
        } catch (error) {
          console.error('Error processing sentence:', sentence, error);
          if (error instanceof Error) {
            setError(`音声の生成中にエラーが発生しました: ${error.message}`);
          } else {
            setError('音声の生成中にエラーが発生しました');
          }
          // 個別の文の処理に失敗しても、全体の処理は継続
          continue;
        }
      }
    } catch (error) {
      console.error('Error generating voice:', error);
      if (error instanceof Error) {
        setError(`音声の生成中にエラーが発生しました: ${error.message}`);
      } else {
        setError('音声の生成中にエラーが発生しました');
      }
    } finally {
      audioObjects.forEach(({ audio, url }) => {
        audio.pause();
        audio.src = '';
        URL.revokeObjectURL(url);
      });
      setIsSpeaking(false);
    }
  }, []);

  // メッセージ送信処理
  const sendMessage = useCallback(async () => {
    if (!userMessage.trim() || isLoading || !genAI) return;

    try {
      setIsLoading(true);
      setError('');

      // ユーザーメッセージを保存
      const userMessageData: Message = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        role: 'user',
        content: userMessage,
        phase: currentPhase,
      };

      messageDispatch({
        type: 'ADD_MESSAGE',
        message: userMessageData,
      });

      setUserMessage('');

      // フェーズに基づいてプロンプトを生成
      const prompt = generatePrompt(messageState.messages, currentPhase);

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });
      const result = await model.generateContentStream({
        contents: prompt,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      });

      setIsStreaming(true);
      setStreamingResponse('');

      const assistantMessageId = crypto.randomUUID();
      let fullResponse = '';

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;
        setStreamingResponse(fullResponse);
      }

      setIsStreaming(false);

      // 完全な応答を保存
      const assistantMessageData: Message = {
        id: assistantMessageId,
        timestamp: Date.now(),
        role: 'assistant',
        content: fullResponse,
        phase: currentPhase,
      };

      messageDispatch({
        type: 'ADD_MESSAGE',
        message: assistantMessageData,
      });

      // 完全な応答を音声合成
      await speakText(fullResponse);

      const nextPhase = getNextPhase(currentPhase, userMessage);
      if (nextPhase !== currentPhase) {
        setCurrentPhase(nextPhase);
      }

      // 次の話者を設定（フェーズに応じて）
      if (nextPhase === 'intro_reacting' || nextPhase === 'intro_next_person') {
        goToNextSpeaker();
      }

    } catch (error) {
      console.error('Error generating response:', error);
      setError('応答の生成中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  }, [userMessage, isLoading, genAI, messageState.messages, currentPhase, speakText, goToNextSpeaker, setCurrentPhase]);

  // フェーズに基づく初期メッセージの設定
  useEffect(() => {
    if (members.length > 0 && messageState.messages.length === 0) {
      const openingText = getPhaseInstruction(currentPhase);
      const openingMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: openingText,
        timestamp: Date.now(),
        phase: currentPhase,
      };
      messageDispatch({ type: 'ADD_MESSAGE', message: openingMessage });
      speakText(openingText);
    }
  }, [members, messageState.messages, speakText, currentPhase]);

  // 音声認識の設定
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ja-JP';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');

          if (event.results[0].isFinal) {
            setUserMessage(transcript);
            setTimeout(() => {
              sendMessage();
            }, 500);
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);
          setError('音声認識中にエラーが発生しました。');
          setIsListening(false);
        };

        recognitionRef.current = recognition;

        return () => {
          if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
          }
        };
      }
    }
  }, [sendMessage]);

  // 音声認識の開始/停止
  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError('お使いのブラウザは音声認識に対応していません。');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);







  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
    }
  }, []);



  return (
    <div className="relative w-screen h-screen">
      <Image
        src="/obachan.png"
        alt="おばちゃんアバター"
        fill
        className="object-cover"
        priority
      />
      <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 w-full max-w-2xl px-4">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        <div className="space-y-4 mb-4 max-h-[60vh] overflow-y-auto">
          {useMemo(() => 
            messageState.messages.map((message) => (
              <div key={message.id} className="relative">
                <div className={`rounded-2xl p-4 shadow-lg max-w-[80%] ${
                  message.role === 'assistant' 
                    ? 'bg-blue-100' 
                    : 'bg-white/90 backdrop-blur-sm ml-auto'
                }`}>
                  <p className="text-gray-800">
                    {message.content}
                  </p>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString()}
                    {message.phase && (
                      <span className="ml-2 text-xs text-blue-600">
                        [{message.phase}]
                      </span>
                    )}
                  </div>
                  <div className={`absolute bottom-0 ${
                    message.role === 'assistant' 
                      ? 'left-0 -translate-x-1/2' 
                      : 'right-0 translate-x-1/2'
                  } w-4 h-4 transform translate-y-1/2 rotate-45 ${
                    message.role === 'assistant' 
                      ? 'bg-blue-100' 
                      : 'bg-white/90'
                  }`}></div>
                </div>
              </div>
            )), [messageState.messages]
          )}
          {userMessage && (
            <div className="relative">
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 shadow-lg max-w-[80%] ml-auto">
                <p className="text-gray-800">
                  {userMessage}
                </p>
                <div className="absolute bottom-0 right-0 w-4 h-4 transform translate-x-1/2 translate-y-1/2 rotate-45 bg-white/90"></div>
              </div>
            </div>
          )}
          {isStreaming && streamingResponse && (
            <div className="relative">
              <div className="bg-blue-100 rounded-2xl p-4 shadow-lg max-w-[80%]">
                <p className="text-gray-800">
                  {streamingResponse}
                  <span className="animate-pulse">|</span>
                </p>
                <div className="text-xs text-gray-500 mt-1">
                  リアルタイム応答中...
                </div>
                <div className="absolute bottom-0 left-0 w-4 h-4 transform -translate-x-1/2 translate-y-1/2 rotate-45 bg-blue-100"></div>
              </div>
            </div>
          )}
          {isLoading && !isStreaming && (
            <div className="relative">
              <div className="bg-blue-100 rounded-2xl p-4 shadow-lg max-w-[80%]">
                <p className="text-gray-800">
                  考え中...
                </p>
                <div className="absolute bottom-0 left-0 w-4 h-4 transform -translate-x-1/2 translate-y-1/2 rotate-45 bg-blue-100"></div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <button
            onClick={toggleListening}
            className={`flex-1 py-3 px-6 rounded-full text-white font-bold transition-colors ${
              isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {isListening ? '音声認識を停止' : '音声認識を開始'}
          </button>
          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              className="py-3 px-6 rounded-full text-white font-bold bg-gray-500 hover:bg-gray-600 transition-colors"
            >
              読み上げを停止
            </button>
          )}
        </div>
      </div>
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                