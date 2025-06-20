import { NextResponse } from 'next/server';
import axios from 'axios';

interface CacheEntry {
  data: ArrayBuffer;
  timestamp: number;
}

const ttsCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

// VOICEVOX connection status cache
let voicevoxConnectionStatus: { isConnected: boolean; lastChecked: number } = {
  isConnected: false,
  lastChecked: 0
};
const CONNECTION_CHECK_INTERVAL = 30 * 1000; // 30 seconds

async function checkVoicevoxConnection(): Promise<boolean> {
  const now = Date.now();
  
  if (now - voicevoxConnectionStatus.lastChecked < CONNECTION_CHECK_INTERVAL) {
    return voicevoxConnectionStatus.isConnected;
  }

  try {
    const versionResponse = await axios.get('http://localhost:50021/version', { timeout: 5000 });
    console.log('VOICEVOX Engine version:', versionResponse.data);
    voicevoxConnectionStatus = { isConnected: true, lastChecked: now };
    return true;
  } catch (error) {
    console.error('VOICEVOX Engine connection error:', error);
    voicevoxConnectionStatus = { isConnected: false, lastChecked: now };
    return false;
  }
}

function getCachedTTS(text: string): ArrayBuffer | null {
  const entry = ttsCache.get(text);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    ttsCache.delete(text);
    return null;
  }
  
  return entry.data;
}

function setCachedTTS(text: string, data: ArrayBuffer): void {
  if (ttsCache.size >= MAX_CACHE_SIZE) {
    const firstKey = ttsCache.keys().next().value;
    if (firstKey !== undefined) {
      ttsCache.delete(firstKey);
    }
  }
  
  ttsCache.set(text, {
    data,
    timestamp: Date.now()
  });
}

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    const cachedAudio = getCachedTTS(text);
    if (cachedAudio) {
      console.log('Returning cached TTS response for:', text);
      return new NextResponse(cachedAudio, {
        headers: {
          'Content-Type': 'audio/wav',
          'X-Cache': 'HIT'
        },
      });
    }

    const isConnected = await checkVoicevoxConnection();
    if (!isConnected) {
      return NextResponse.json(
        { error: 'VOICEVOX Engine is not running. Please start the engine first.' },
        { status: 503 }
      );
    }

    // 音声クエリの生成
    let audioQuery;
    try {
      console.log('Generating audio query for text:', text);
      const response = await axios.post(
        `http://localhost:50021/audio_query?text=${encodeURIComponent(text)}&speaker=3`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      audioQuery = response.data;
      console.log('Audio query generated successfully');
    } catch (error) {
      console.error('Audio query generation error:', error);
      if (axios.isAxiosError(error)) {
        console.error('Error details:', {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers,
        });
      }
      return NextResponse.json(
        { error: 'Failed to generate audio query', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }

    // 音声合成の実行
    try {
      console.log('Starting speech synthesis');
      const synthesisResponse = await axios.post(
        'http://localhost:50021/synthesis?speaker=3',
        audioQuery,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );
      console.log('Speech synthesis completed successfully');

      setCachedTTS(text, synthesisResponse.data);

      // 音声データを返す
      return new NextResponse(synthesisResponse.data, {
        headers: {
          'Content-Type': 'audio/wav',
          'X-Cache': 'MISS'
        },
      });
    } catch (error) {
      console.error('Synthesis error:', error);
      if (axios.isAxiosError(error)) {
        console.error('Error details:', {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers,
        });
      }
      return NextResponse.json(
        { error: 'Failed to synthesize speech', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('TTS Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}    