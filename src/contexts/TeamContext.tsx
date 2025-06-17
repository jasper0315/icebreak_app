'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface Member {
  name: string;
  university: string;
}

interface TeamContextType {
  members: Member[];
  speakerIndex: number;
  initializeMembers: (members: Member[]) => void;
  goToNextSpeaker: () => void;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [speakerIndex, setSpeakerIndex] = useState<number>(-1);

  // localStorageから状態を復元
  useEffect(() => {
    const storedMembers = localStorage.getItem('team_members');
    const storedSpeakerIndex = localStorage.getItem('speaker_index');
    
    if (storedMembers) {
      setMembers(JSON.parse(storedMembers));
    }
    if (storedSpeakerIndex) {
      setSpeakerIndex(parseInt(storedSpeakerIndex, 10));
    }
  }, []);

  // 状態の変更をlocalStorageに保存
  useEffect(() => {
    localStorage.setItem('team_members', JSON.stringify(members));
  }, [members]);

  useEffect(() => {
    localStorage.setItem('speaker_index', speakerIndex.toString());
  }, [speakerIndex]);

  const initializeMembers = (newMembers: Member[]) => {
    setMembers(newMembers);
    setSpeakerIndex(0); // 最初の話者を設定
  };

  const goToNextSpeaker = () => {
    setSpeakerIndex(prev => prev + 1);
  };

  return (
    <TeamContext.Provider value={{ members, speakerIndex, initializeMembers, goToNextSpeaker }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) {
    throw new Error('useTeam must be used within a TeamProvider');
  }
  return context;
} 