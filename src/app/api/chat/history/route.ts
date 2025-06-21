import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  QueryCommand, 
  PutCommand, 
  DeleteCommand 
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { ConversationPhase } from '@/lib/types';

export const runtime = 'edge';

// DynamoDBクライアントの初期化
const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const docClient = DynamoDBDocumentClient.from(client);

// メッセージを保存する関数
async function saveMessage(data: {
  conversationId: string;
  role: string;
  content: string;
  phase: ConversationPhase;
  timestamp: number;
}) {
  const messageId = uuidv4();
  const message = {
    ...data,
    messageId,
  };

  const command = new PutCommand({
    TableName: 'ChatHistory',
    Item: message,
  });

  await docClient.send(command);
  return message;
}

// 新しい会話を開始する関数
async function startConversation() {
  const conversationId = uuidv4();
  const timestamp = Date.now();

  const command = new PutCommand({
    TableName: 'ChatHistory',
    Item: {
      conversationId,
      messageId: 'system',
      role: 'system',
      content: 'Conversation started',
      phase: 'intro_start',
      timestamp,
    },
  });

  await docClient.send(command);
  return conversationId;
}

// 会話を終了する関数
async function endConversation(conversationId: string) {
  const command = new DeleteCommand({
    TableName: 'ChatHistory',
    Key: {
      conversationId,
      messageId: 'system',
    },
  });

  await docClient.send(command);
}

// チャット履歴を取得するAPI
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json(
        { error: '会話IDが必要です' },
        { status: 400 }
      );
    }

    // DynamoDBから履歴を取得
    const command = new QueryCommand({
      TableName: 'ChatHistory',
      KeyConditionExpression: 'conversationId = :conversationId',
      ExpressionAttributeValues: {
        ':conversationId': conversationId,
      },
      ScanIndexForward: true, // 時系列順に取得
    });

    const response = await docClient.send(command);
    const history = response.Items || [];

    console.log('Successfully retrieved chat history:', {
      conversationId,
      messageCount: history.length,
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error('Error retrieving chat history:', error);
    return NextResponse.json(
      { error: 'チャット履歴の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// メッセージを保存するAPI
export async function POST(request: Request) {
  console.log('Received POST request for saving message:', {
    url: request.url,
    timestamp: new Date().toISOString()
  });

  try {
    const body = await request.json();
    const { conversationId, role, content, phase } = body;

    if (!conversationId || !role || !content || !phase) {
      console.warn('Missing required parameters in POST request:', {
        conversationId,
        role,
        content: content ? 'present' : 'missing',
        phase
      });
      return NextResponse.json(
        { error: '必要なパラメータが不足しています' },
        { status: 400 }
      );
    }

    const message = await saveMessage({
      conversationId,
      role,
      content,
      phase,
      timestamp: Date.now(),
    });

    console.log('Successfully saved message:', {
      messageId: message.messageId,
      conversationId,
      role,
      phase,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({ message });
  } catch (error) {
    console.error('Error in POST /api/chat/history:', {
      error,
      url: request.url,
      timestamp: new Date().toISOString()
    });
    return NextResponse.json(
      { error: 'メッセージの保存に失敗しました' },
      { status: 500 }
    );
  }
}

// 新しい会話を開始するAPI
export async function PUT(request: Request) {
  console.log('Received PUT request for starting new conversation:', {
    url: request.url,
    timestamp: new Date().toISOString()
  });

  try {
    const conversationId = await startConversation();
    console.log('Successfully started new conversation:', {
      conversationId,
      timestamp: new Date().toISOString()
    });
    return NextResponse.json({ conversationId });
  } catch (error) {
    console.error('Error in PUT /api/chat/history:', {
      error,
      url: request.url,
      timestamp: new Date().toISOString()
    });
    return NextResponse.json(
      { error: '会話の開始に失敗しました' },
      { status: 500 }
    );
  }
}

// 会話を終了するAPI
export async function DELETE(request: Request) {
  console.log('Received DELETE request for ending conversation:', {
    url: request.url,
    timestamp: new Date().toISOString()
  });

  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      console.warn('Missing conversationId in DELETE request');
      return NextResponse.json(
        { error: '会話IDが必要です' },
        { status: 400 }
      );
    }

    await endConversation(conversationId);
    console.log('Successfully ended conversation:', {
      conversationId,
      timestamp: new Date().toISOString()
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/chat/history:', {
      error,
      url: request.url,
      timestamp: new Date().toISOString()
    });
    return NextResponse.json(
      { error: '会話の終了に失敗しました' },
      { status: 500 }
    );
  }
} 