'use client';

import Image from "next/image";
import { useState, useEffect, useCallback, useRef, useReducer, useMemo } from "react";

import { useTeam } from '@/contexts/TeamContext';
import { useRouter } from 'next/navigation';
import { Message, ConversationPhase } from '@/lib/types';
import { generatePrompt, getNextPhase } from '@/lib/prompts';

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

// 初期メッセージの定義
const INITIAL_MESSAGE = `わて、ずんだもんて言いますねん。ここのMC、言うたら「関西のおばちゃん」担当させてもろてます。今日は堅苦しいのはなしで、みんなでワイワイ楽しい時間にしたいと思てますねん。普段言いたくても言われへんこととか、遠慮なくバンバン出してくれたらええからね。まずはみんなの「今日ここに来るまでになんか面白いことあった？」とか、他愛もない話でも聞かせてくれへん？ ほな、そちらの方から、よろしゅう頼んます！`;



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
  const { members, goToNextSpeaker } = useTeam();
  const router = useRouter();
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [userMessage, setUserMessage] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const [messageState, messageDispatch] = useReducer(messageReducer, initialMessageState);
  const [genAI, setGenAI] = useState<GoogleGenerativeAI | null>(null);
  const [currentPhase, setCurrentPhase] = useState<ConversationPhase>('intro_start');
  const [streamingResponse, setStreamingResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Gemini APIの初期化（遅延読み込み）
  useEffect(() => {
    const initializeGeminiAI = async () => {
      if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
        setError('Gemini API key is not configured. Please create a .env.local file with NEXT_PUBLIC_GEMINI_API_KEY to enable AI conversation features. See .env.local.example for setup instructions.');
        return;
      }

      try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        setGenAI(new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY));
        setError('');
      } catch (error) {
        console.error('Failed to load GoogleGenerativeAI:', error);
        setError('AI機能の読み込みに失敗しました。ネットワーク接続を確認してください。');
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

    try {
      setIsSpeaking(true);

      // テキストを文単位で分割
      const sentences = text
        .split(/[。！？\n]/)
        .map(s => s.trim())
        .filter(s => s !== '');

      const waitForVoices = () => {
        return new Promise<SpeechSynthesisVoice[]>((resolve) => {
          const voices = speechSynthesis.getVoices();
          if (voices.length > 0) {
            resolve(voices);
          } else {
            speechSynthesis.addEventListener('voiceschanged', () => {
              resolve(speechSynthesis.getVoices());
            }, { once: true });
          }
        });
      };

      const voices = await waitForVoices();
      const japaneseVoice = voices.find(voice => voice.lang.startsWith('ja')) || voices[0];

      // 各文を順番に処理
      for (const sentence of sentences) {
        try {
          // Web Speech API を使用した音声合成
          await new Promise<void>((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(sentence);
            
            utterance.lang = 'ja-JP';
            utterance.rate = 0.9; // 少し遅めに設定
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            if (japaneseVoice) {
              utterance.voice = japaneseVoice;
            }

            // 再生完了時の処理
            utterance.onend = () => {
              resolve();
            };

            // エラー時の処理
            utterance.onerror = (event) => {
              console.error('Speech synthesis error:', event.error);
              if (event.error === 'not-allowed') {
                console.warn('Speech synthesis not allowed. User may need to interact with page first.');
              }
              reject(new Error(`音声合成エラー: ${event.error}`));
            };

            speechSynthesis.speak(utterance);
          });
        } catch (error) {
          console.error('Error processing sentence:', sentence, error);
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
      setIsSpeaking(false);
    }
  }, []);

  // メッセージ送信処理
  const sendMessage = useCallback(async () => {
    if (!userMessage.trim() || isLoading) return;

    if (!genAI) {
      setError('AI機能が利用できません。Gemini API keyが設定されていることを確認してください。');
      
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

      const fallbackResponse: Message = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        role: 'assistant',
        content: 'すみません、AI機能が現在利用できません。管理者にGemini API keyの設定を確認してもらってください。',
        phase: currentPhase,
      };

      messageDispatch({
        type: 'ADD_MESSAGE',
        message: fallbackResponse,
      });

      setUserMessage('');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

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

      if (nextPhase === 'intro_reacting' || nextPhase === 'intro_next_person') {
        goToNextSpeaker();
      }

    } catch (error) {
      console.error('Error generating response:', error);
      setError('応答の生成中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  }, [userMessage, isLoading, genAI, messageState.messages, currentPhase, speakText, goToNextSpeaker]);

  useEffect(() => {
    if (members.length > 0 && messageState.messages.length === 0) {
      const openingMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: INITIAL_MESSAGE,
        timestamp: Date.now(),
        phase: 'intro_start',
      };
      messageDispatch({ type: 'ADD_MESSAGE', message: openingMessage });
      speakText(INITIAL_MESSAGE);
    }
  }, [members, messageState.messages, speakText]);

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
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
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
    </div>
  );
}
