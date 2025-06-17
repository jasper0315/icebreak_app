'use client';

import React from 'react';
import { TeamMember } from '@/lib/types';

interface MemberFormProps {
  member: TeamMember;
  onChange: (id: string, field: keyof TeamMember, value: string) => void;
  onRemove: (id: string) => void;
}

export const MemberForm: React.FC<MemberFormProps> = ({ member, onChange, onRemove }) => {
  return (
    <div className="flex items-center gap-4 mb-4">
      <div className="flex-1">
        <input
          type="text"
          value={member.name}
          onChange={(e) => onChange(member.id, 'name', e.target.value)}
          placeholder="名前（ひらがな）"
          className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex-1">
        <input
          type="text"
          value={member.affiliation}
          onChange={(e) => onChange(member.id, 'affiliation', e.target.value)}
          placeholder="所属（大学など）"
          className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        onClick={() => onRemove(member.id)}
        className="px-4 py-2 text-red-600 hover:text-red-800 focus:outline-none"
      >
        削除
      </button>
    </div>
  );
}; 