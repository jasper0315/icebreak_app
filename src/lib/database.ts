import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import path from 'path';

// .env.localファイルを読み込む
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// 環境変数の読み込みを確認
console.log('Loading environment variables:', {
  hasRegion: !!process.env.AWS_REGION,
  hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
  hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
  envPath: path.resolve(process.cwd(), '.env.local')
});

// 環境変数の型定義
interface EnvConfig {
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
}

// 環境変数の取得
const getEnvConfig = (): EnvConfig => {
  const config = {
    AWS_REGION: process.env.AWS_REGION || 'ap-northeast-1',
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  };

  // 環境変数の検証
  const missingVars = Object.entries(config)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars);
    throw new Error(`必要な環境変数が設定されていません: ${missingVars.join(', ')}`);
  }

  return config;
};

// 環境変数の設定を取得
const envConfig = getEnvConfig();

// DynamoDBクライアントの初期化
const client = new DynamoDBClient({
  region: envConfig.AWS_REGION,
  credentials: {
    accessKeyId: envConfig.AWS_ACCESS_KEY_ID,
    secretAccessKey: envConfig.AWS_SECRET_ACCESS_KEY,
  },
});

const docClient = DynamoDBDocumentClient.from(client);

// テーブル名
const TABLE_NAME = 'ChatHistory';

// DynamoDBの接続を確認する関数
async function verifyDynamoDBConnection() {
  try {
    console.log('Verifying DynamoDB connection...', {
      region: envConfig.AWS_REGION,
      hasAccessKey: !!envConfig.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!envConfig.AWS_SECRET_ACCESS_KEY,
      timestamp: new Date().toISOString()
    });

    const command = new DescribeTableCommand({
      TableName: TABLE_NAME,
    });

    console.log('Attempting to connect to DynamoDB:', {
      tableName: TABLE_NAME,
      region: envConfig.AWS_REGION,
      timestamp: new Date().toISOString()
    });

    const response = await client.send(command);
    console.log('Successfully connected to DynamoDB:', {
      tableName: TABLE_NAME,
      tableStatus: response.Table?.TableStatus,
      timestamp: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error('Failed to connect to DynamoDB:', {
      error,
      tableName: TABLE_NAME,
      timestamp: new Date().toISOString(),
      errorDetails: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      awsConfig: {
        region: envConfig.AWS_REGION,
        hasAccessKey: !!envConfig.AWS_ACCESS_KEY_ID,
        hasSecretKey: !!envConfig.AWS_SECRET_ACCESS_KEY
      }
    });

    if (error instanceof Error) {
      if (error.message.includes('AccessDeniedException')) {
        throw new Error('AWS認証情報の権限が不足しています。IAMポリシーを確認してください。');
      } else if (error.message.includes('ResourceNotFoundException')) {
        throw new Error(`DynamoDBテーブル "${TABLE_NAME}" が存在しません。テーブルを作成してください。`);
      } else if (error.message.includes('InvalidSignatureException')) {
        throw new Error('AWS認証情報が無効です。アクセスキーとシークレットキーを確認してください。');
      } else if (error.message.includes('ExpiredTokenException')) {
        throw new Error('AWS認証情報のトークンが期限切れです。新しい認証情報を設定してください。');
      } else if (error.message.includes('Missing credentials')) {
        throw new Error('AWS認証情報が設定されていません。.env.localファイルを確認してください。');
      }
    }

    throw new Error('DynamoDBへの接続に失敗しました。認証情報とテーブルの設定を確認してください。');
  }
}

// メッセージの型定義
export interface Message {
  conversationId: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  phase: string;
}

// メッセージを保存する関数
export async function saveMessage(message: Omit<Message, 'messageId'>): Promise<Message> {
  try {
    // 接続確認
    await verifyDynamoDBConnection();

    const messageId = uuidv4();
    const messageWithId: Message = {
      ...message,
      messageId,
    };

    console.log('Saving message to DynamoDB:', {
      tableName: TABLE_NAME,
      message: messageWithId,
      timestamp: new Date().toISOString()
    });

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: messageWithId,
    });

    const result = await docClient.send(command);
    console.log('Successfully saved message to DynamoDB:', {
      messageId,
      conversationId: message.conversationId,
      result,
      timestamp: new Date().toISOString()
    });
    return messageWithId;
  } catch (error) {
    console.error('Error saving message to DynamoDB:', {
      error,
      message,
      timestamp: new Date().toISOString()
    });
    throw new Error(`メッセージの保存に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
}

// 会話履歴を取得する関数
export async function getHistory(conversationId: string): Promise<Message[]> {
  try {
    // 接続確認
    await verifyDynamoDBConnection();

    console.log('Fetching chat history from DynamoDB:', {
      tableName: TABLE_NAME,
      conversationId,
      timestamp: new Date().toISOString()
    });

    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'conversationId = :conversationId',
      ExpressionAttributeValues: {
        ':conversationId': conversationId,
      },
      ScanIndexForward: true, // タイムスタンプの昇順で取得
    });

    const response = await docClient.send(command);
    console.log('Successfully fetched chat history from DynamoDB:', {
      conversationId,
      messageCount: response.Items?.length || 0,
      timestamp: new Date().toISOString()
    });
    return (response.Items || []) as Message[];
  } catch (error) {
    console.error('Error fetching chat history from DynamoDB:', {
      error,
      conversationId,
      timestamp: new Date().toISOString()
    });
    throw new Error(`会話履歴の取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
}

// 会話を開始する関数
export async function startConversation(): Promise<string> {
  try {
    // 接続確認
    await verifyDynamoDBConnection();

    const conversationId = uuidv4();
    console.log('Starting new conversation:', {
      conversationId,
      timestamp: new Date().toISOString()
    });
    return conversationId;
  } catch (error) {
    console.error('Error starting conversation:', {
      error,
      timestamp: new Date().toISOString()
    });
    throw new Error(`会話の開始に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
}

// 会話を終了する関数
export async function endConversation(conversationId: string): Promise<void> {
  try {
    // 接続確認
    await verifyDynamoDBConnection();

    console.log('Ending conversation:', {
      conversationId,
      timestamp: new Date().toISOString()
    });
    // 必要に応じて会話の終了処理を実装
    // 例: 会話のステータスを更新するなど
  } catch (error) {
    console.error('Error ending conversation:', {
      error,
      conversationId,
      timestamp: new Date().toISOString()
    });
    throw new Error(`会話の終了に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
} 