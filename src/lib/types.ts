// チームメンバーの型定義
export interface TeamMember {
  id: string;
  name: string;      // ひらがなの名前
  affiliation: string; // 所属（大学など）
}

// チームコンテキストの型定義
export interface TeamContextType {
  members: TeamMember[];
  addMember: (member: TeamMember) => void;
  removeMember: (id: string) => void;
  updateMember: (id: string, member: Partial<TeamMember>) => void;
  setMembers: (members: TeamMember[]) => void;
  clearMembers: () => void;
}

// メッセージの型定義（統一版）
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  phase?: ConversationPhase;
}

// 会話フェーズの型定義（既存のConversationPhase型を移動）
export type ConversationPhase = 
  | 'intro_start'
  | 'intro_reacting'
  | 'intro_next_person'
  | 'icebreak_start'
  | 'random_theme'
  | 'deep_dive';  