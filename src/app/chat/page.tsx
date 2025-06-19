'use client';

import Image from "next/image";
import { useState, useEffect, useCallback, useRef, useReducer } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import superagent from 'superagent';
import { useTeam } from '@/contexts/TeamContext';
import { useRouter } from 'next/navigation';

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
const INITIAL_MESSAGE = `わて、ずんだもんて言いますねん。ずんだもんって言うても、枝豆ちゃうで？ ここのMC、言うたら「関西のおばちゃん」担当させてもろてます。初めましての人も、そうでない人も、今日はせっかくやから、みんなでワイワイ、楽しい時間にしたいと思てますねん。「会議」って言うと、ちょっと肩肘張る感じするやん？ でも、堅苦しいのはなしなし！ ここにおるん、みんな仲間やからね。今日は、普段言いたくても言われへんこととか、聞いてみたいこととか、遠慮なくバンバン出してくれたらええからね。さあ、せっかくやから、まずはみんなの「今日ここに来るまでになんか面白いことあった？」とか、他愛もない話でも聞かせてくれへん？ なんでもええで、ほんま！ あっ、ちなみにわては、今朝、うちの旦那が靴下裏返しで履いてて、思わずツッコんでしもたわ〜！ もう、しゃーない男やで、ほんま。ほな、自己紹介はわてから見て、右側の一番近い方から時計回りでお願いしよか。じゃあ、まずはそちらの方から、よろしゅう頼んます！`;

// メッセージの型定義
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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
  const { members } = useTeam();
  const router = useRouter();
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [userMessage, setUserMessage] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [speakerIndex, setSpeakerIndex] = useState(0);
  const [messageState, messageDispatch] = useReducer(messageReducer, initialMessageState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [genAI, setGenAI] = useState<GoogleGenerativeAI | null>(null);

  // Gemini APIの初期化
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      setError('Gemini API key is not set');
      return;
    }

    setGenAI(new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY));
  }, []);

  // メンバー情報がない場合は登録ページにリダイレクト
  useEffect(() => {
    if (members.length === 0) {
      router.replace('/setup');
    }
  }, [members, router]);

  // 初期メッセージの設定
  useEffect(() => {
    // membersが空配列でなければ初期化済みとみなす
    if (
      members.length > 0 &&
      (messageState.messages.length === 0 ||
        messageState.messages[0].content !== INITIAL_MESSAGE)
    ) {
      const openingMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: INITIAL_MESSAGE,
        timestamp: Date.now(),
      };
      messageDispatch({ type: 'ADD_MESSAGE', message: openingMessage });
      speakText(INITIAL_MESSAGE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);
          setError('音声認識中にエラーが発生しました。');
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  // 音声認識の開始/停止
  const toggleListening = () => {
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
  };

  // 音声合成
const speakText = async (text: string) => {
    if (!text) return;

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
      setIsSpeaking(false);
    }
  };

  // メッセージ送信処理
  const sendMessage = async () => {
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
      };

      messageDispatch({
        type: 'ADD_MESSAGE',
        message: userMessageData,
      });

      setUserMessage('');

      // 現在の話者に基づいてプロンプトを生成
      const currentSpeaker = members[speakerIndex];
      const nextSpeakerIndex = speakerIndex + 1;
      const isLastSpeaker = nextSpeakerIndex >= members.length;
      
      const prompt = [
        {
          role: 'user',
          parts: [{ text: `あなたは、会議の冒頭で初対面の人同士の緊張をほぐし、積極的な話し合いを促す、明るくて世話焼きな「関西のおばちゃんMC」です。
${currentSpeaker.name}さんの自己紹介にリアクションしてください。
友好的でユーモラスな口調で、参加者全員が楽しめるように会話を進めてください。
常にグループの一員として、積極的に会話に参加し、他のメンバーの発言にも気さくにツッコミを入れたり、質問を投げかけたり、共通点を見つけて繋げたりして、全員を巻き込んでください。

${isLastSpeaker 
  ? '全員の自己紹介が終わったので、次のアイスブレイクコーナーに移ることを宣言してください。'
  : `次は${members[nextSpeakerIndex].name}さんに自己紹介をお願いすることを伝えてください。`
}` }]
        }
      ];

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

      let fullResponse = '';
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;
      }

      // 完全な応答を保存
      const assistantMessageData: Message = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        role: 'assistant',
        content: fullResponse,
      };

      messageDispatch({
        type: 'ADD_MESSAGE',
        message: assistantMessageData,
      });

      // 完全な応答を音声合成
      await speakText(fullResponse);

      // 次の話者を設定
      goToNextSpeaker();

    } catch (error) {
      console.error('Error generating response:', error);
      setError('応答の生成中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
    }
  };

  // 次の話者に移る関数
  const goToNextSpeaker = () => {
    setSpeakerIndex(prev => prev + 1);
  };

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
          {messageState.messages.map((message) => (
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
          ))}
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
          {isLoading && (
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