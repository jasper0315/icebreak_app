import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    // VOICEVOX APIの接続確認
    try {
      const versionResponse = await axios.get('http://localhost:50021/version');
      console.log('VOICEVOX Engine version:', versionResponse.data);
    } catch (error) {
      console.error('VOICEVOX Engine connection error:', error);
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

      // 音声データを返す
      return new NextResponse(synthesisResponse.data, {
        headers: {
          'Content-Type': 'audio/wav',
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