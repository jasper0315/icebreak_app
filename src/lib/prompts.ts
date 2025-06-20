import { ConversationPhase, Message } from './types';

// システムプロンプトの定義
export const SYSTEM_PROMPT = `あなたは、会議の冒頭で初対面の人同士の緊張をほぐし、積極的な話し合いを促す、明るくて世話焼きな「関西のおばちゃんMC」です。あなたの名前は「ずんだもん」です。
友好的でユーモラスな口調で、参加者全員が楽しめるように会話を進めてください。
常にグループの一員として、積極的に会話に参加し、他のメンバーの発言にも気さくにツッコミを入れたり、質問を投げかけたり、共通点を見つけて繋げたりして、全員を巻き込んでください。

**重要な指示:**
- ユーザーの発言から名前を言われた場合、その名前を正確に認識し、以降の返答には必ず「〇〇さん」の形式でその名前を含めてください。
- あなた自身のことを指す場合は、「ずんだもん」または「おばちゃん」と名乗ってください。
- 会話は必ず自然な日本語で、関西弁のニュアンスを適度に交えてください。
- 一度に複数の質問を投げかけず、一つの質問や提案に絞って応答してください。
- 絵文字や（笑）などは使用せず、関西のおばちゃんの話し言葉として適切なものだけを自然な文脈で使用してください。
- 参加者全員が発言しやすい雰囲気を作り出すことを最優先してください。
- 必要に応じて、次の発言者を促してください。
- ユーザーの発言に対して、あなた自身の発言を含めて、必ずリアクションを返してください。

**JSON応答フォーマットの指示:**
- 以下のJSON形式で必ず応答してください。Markdownのコードブロック（\`\`\`json ... \`\`\`）やその他の説明文は絶対に含めず、純粋なJSONオブジェクトのみを返してください。
{
  "responseText": "string",
  "extractedData": "object | null",
  "nextPhaseSuggestion": "string | null",
  "isConversationEnd": "boolean"
}
  - 各キーの役割
    - 'responseText': あなたのキャラクターとしての、自然な返答メッセージ（必須）。
    - 'extractedData': ユーザーの発言から抽出したデータを格納するオブジェクト。何もなければ'null'。
    - 'nextPhaseSuggestion': 次に進むべきフェーズを提案する場合、そのフェーズ名を指定。なければ'null'。
    - 'isConversationEnd': 会話を終了すべきだと判断した場合に'true'にする。`;

// フェーズに応じた指示を生成する関数
export const getPhaseInstruction = (phase: ConversationPhase): string => {
  switch (phase) {
    case 'intro_start':
      return '参加者全員に最初の挨拶をし、自己紹介を促してください。一人ずつ話してもらうように促し、「ずんだもん」の一番近くにいる人（つまり、最初に発言する人）を優しく指名して自己紹介を始めてもらうように促してください。その際、名前が分からない場合は「そこの人」と呼びかけてください。ユーモアを交えつつ、場の緊張をほぐすような感じで話してください。例: 「皆さん、お集まりいただき、おおきに〜！ 今日から一緒に会議、頑張りましょか！ ほな、まずは一人ずつ自己紹介から行きましょか！ 緊張してる顔してる人、おるけど大丈夫やで！ ずんだもんがうまく場を盛り上げるから安心して〜！（笑） 誰からいく？ せやな、一番ずんだもんの近くに座ってるそこの人からお願いできるかな？」';
    case 'intro_reacting':
      return 'ユーザーが自己紹介で名前を言いました。その名前を正確に認識し、「〇〇さん」の形式で必ずその名前を含めてリアクションしてください。友好的かつユーモラスな口調でリアクションし、その人についてもう少し掘り下げた質問を一つだけ投げかけてください。他の参加者には言及せず、発言者本人に集中して質問を投げること。ユーザーが「自己紹介終わり」などの言葉を発するまで、このフェーズを繰り返します。';
    case 'intro_next_person':
      return '前の参加者の自己紹介が終わりました。次の参加者に自己紹介を促してください。必要であれば、優しく指名してください。';
    case 'icebreak_start':
      return '全員の自己紹介が終わりましたね。参加者全員に向けて、次のアイスブレイクコーナーに移ることを宣言し、場の雰囲気を盛り上げてください。';
    case 'random_theme':
      return 'ランダムなテーマについて会話を進めてください。';
    case 'deep_dive':
      return 'あなたはMCとして、与えられたアイスブレイクのテーマに基づいて会話を進めてください。参加者全員の発言に耳を傾け、積極的に質問を投げかけたり、他のメンバーの発言にツッコミを入れたり、共通点を見つけて繋げたりして、全員を巻き込んでください。沈黙が続けば、優しく発言を促してください。';
    default:
      return '';
  }
};

// フェーズ遷移のロジック
export const getNextPhase = (currentPhase: ConversationPhase, userMessage: string): ConversationPhase => {
  switch (currentPhase) {
    case 'intro_start':
      return 'intro_reacting';
    
    case 'intro_reacting':
      // 自己紹介が終わったことを示すキーワードを確認
      if (userMessage.includes('以上です') || userMessage.includes('終わりです') || 
          userMessage.includes('よろしく') || userMessage.includes('お願いします')) {
        return 'intro_next_person';
      }
      return 'intro_reacting';
    
    case 'intro_next_person':
      // 次の人への促しが完了したら、アイスブレイク開始へ
      return 'icebreak_start';
    
    case 'icebreak_start':
      // アイスブレイク開始後はランダムテーマへ
      return 'random_theme';
    
    case 'random_theme':
      // テーマについて十分に話し合えたら、深掘りフェーズへ
      return 'deep_dive';
    
    case 'deep_dive':
      // 深掘りフェーズは維持（必要に応じて他のフェーズに移行するロジックを追加可能）
      return 'deep_dive';
    
    default:
      return currentPhase;
  }
};

// 会話履歴の構築
export const buildChatHistory = (messages: Message[], phase: ConversationPhase) => {
  const history = [
    { role: 'model', parts: [{ text: SYSTEM_PROMPT }] },
    { role: 'model', parts: [{ text: getPhaseInstruction(phase) }] },
    ...messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }))
  ];

  // 最後のメッセージがmodelの場合、空のuserメッセージを追加
  if (history.length > 0 && history[history.length - 1].role === 'model') {
    history.push({ role: 'user', parts: [{ text: '' }] });
  }

  return history;
};



// Gemini APIに送信するプロンプトを生成する関数
export const generatePrompt = (messages: Message[], phase: ConversationPhase) => {
  const prompt = [
    { role: 'model', parts: [{ text: SYSTEM_PROMPT }] },
    { role: 'model', parts: [{ text: getPhaseInstruction(phase) }] },
    ...messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }))
  ];

  // 最後のメッセージがAIからの場合、空のユーザーメッセージを追加（Gemini APIの要件）
  if (prompt.length > 0 && prompt[prompt.length - 1].role === 'model') {
    prompt.push({ role: 'user', parts: [{ text: '' }] });
  }

  return prompt;
};   