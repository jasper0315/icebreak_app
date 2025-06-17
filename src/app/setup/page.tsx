'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTeam } from '@/contexts/TeamContext';

interface Member {
  name: string;
  university: string;
}

export default function SetupPage() {
  const router = useRouter();
  const { initializeMembers } = useTeam();
  const [members, setMembers] = useState<Member[]>([
    { name: '', university: '' },
    { name: '', university: '' },
    { name: '', university: '' },
    { name: '', university: '' },
    { name: '', university: '' },
  ]);

  const addMember = () => {
    setMembers([...members, { name: '', university: '' }]);
  };

  const removeMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index));
  };

  const updateMember = (index: number, field: keyof Member, value: string) => {
    const newMembers = [...members];
    newMembers[index] = { ...newMembers[index], [field]: value };
    setMembers(newMembers);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validMembers = members.filter(m => m.name && m.university);
    if (validMembers.length > 0) {
      initializeMembers(validMembers);
      router.push('/chat');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            チームメンバーの登録
          </h1>
          <p className="text-gray-600">
            参加者の名前（ひらがな）と所属を入力してください
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          {members.map((member, index) => (
            <div key={index} className="mb-4 last:mb-0">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label htmlFor={`name-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                    名前（ひらがな）
                  </label>
                  <input
                    type="text"
                    id={`name-${index}`}
                    value={member.name}
                    onChange={(e) => updateMember(index, 'name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="なまえ"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor={`university-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                    所属
                  </label>
                  <input
                    type="text"
                    id={`university-${index}`}
                    value={member.university}
                    onChange={(e) => updateMember(index, 'university', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="大学名・会社名など"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removeMember(index)}
                    className="px-3 py-2 text-red-600 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 rounded-md"
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="flex justify-between mt-6">
            <button
              type="button"
              onClick={addMember}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              メンバーを追加
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              チャットを開始
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 