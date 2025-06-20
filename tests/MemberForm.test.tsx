import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemberForm } from '../src/components/MemberForm';
import { TeamMember } from '../src/lib/types';

// モックデータ
const mockMember: TeamMember = {
  id: 'test-id-123',
  name: 'やまだたろう',
  affiliation: '東京大学'
};

// モック関数
const mockOnChange = vi.fn();
const mockOnRemove = vi.fn();

describe('MemberForm Component', () => {
  beforeEach(() => {
    // 各テスト前にモック関数をリセット
    vi.clearAllMocks();
  });

  it('should render with member data', () => {
    render(
      <MemberForm
        member={mockMember}
        onChange={mockOnChange}
        onRemove={mockOnRemove}
      />
    );

    // 名前の入力フィールドが正しい値で表示される
    expect(screen.getByDisplayValue('やまだたろう')).toBeInTheDocument();
    
    // 所属の入力フィールドが正しい値で表示される
    expect(screen.getByDisplayValue('東京大学')).toBeInTheDocument();
    
    // 削除ボタンが表示される
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
  });

  it('should show correct placeholders', () => {
    const emptyMember: TeamMember = {
      id: 'empty-id',
      name: '',
      affiliation: ''
    };

    render(
      <MemberForm
        member={emptyMember}
        onChange={mockOnChange}
        onRemove={mockOnRemove}
      />
    );

    // プレースホルダーが正しく表示される
    expect(screen.getByPlaceholderText('名前（ひらがな）')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('所属（大学など）')).toBeInTheDocument();
  });

  it('should call onChange when name input changes', () => {
    render(
      <MemberForm
        member={mockMember}
        onChange={mockOnChange}
        onRemove={mockOnRemove}
      />
    );

    const nameInput = screen.getByDisplayValue('やまだたろう');
    
    // 名前フィールドに入力
    fireEvent.change(nameInput, { target: { value: 'すずきはなこ' } });
    
    // onChange関数が正しい引数で呼ばれることを確認
    expect(mockOnChange).toHaveBeenCalledWith('test-id-123', 'name', 'すずきはなこ');
  });

  it('should call onChange when affiliation input changes', () => {
    render(
      <MemberForm
        member={mockMember}
        onChange={mockOnChange}
        onRemove={mockOnRemove}
      />
    );

    const affiliationInput = screen.getByDisplayValue('東京大学');
    
    // 所属フィールドに入力
    fireEvent.change(affiliationInput, { target: { value: '京都大学' } });
    
    // onChange関数が正しい引数で呼ばれることを確認
    expect(mockOnChange).toHaveBeenCalledWith('test-id-123', 'affiliation', '京都大学');
  });

  it('should call onRemove when delete button is clicked', () => {
    render(
      <MemberForm
        member={mockMember}
        onChange={mockOnChange}
        onRemove={mockOnRemove}
      />
    );

    const deleteButton = screen.getByRole('button', { name: '削除' });
    
    // 削除ボタンをクリック
    fireEvent.click(deleteButton);
    
    // onRemove関数が正しいIDで呼ばれることを確認
    expect(mockOnRemove).toHaveBeenCalledWith('test-id-123');
  });

  it('should have proper CSS classes', () => {
    render(
      <MemberForm
        member={mockMember}
        onChange={mockOnChange}
        onRemove={mockOnRemove}
      />
    );

    const nameInput = screen.getByDisplayValue('やまだたろう');
    const affiliationInput = screen.getByDisplayValue('東京大学');
    const deleteButton = screen.getByRole('button', { name: '削除' });

    // CSSクラスが正しく適用されているか確認
    expect(nameInput).toHaveClass('w-full', 'px-4', 'py-2', 'border', 'rounded-lg');
    expect(affiliationInput).toHaveClass('w-full', 'px-4', 'py-2', 'border', 'rounded-lg');
    expect(deleteButton).toHaveClass('px-4', 'py-2', 'text-red-600');
  });

  it('should handle multiple rapid changes', () => {
    render(
      <MemberForm
        member={mockMember}
        onChange={mockOnChange}
        onRemove={mockOnRemove}
      />
    );

    const nameInput = screen.getByDisplayValue('やまだたろう');
    
    // 複数回入力を変更
    fireEvent.change(nameInput, { target: { value: 'a' } });
    fireEvent.change(nameInput, { target: { value: 'ab' } });
    fireEvent.change(nameInput, { target: { value: 'abc' } });
    
    // onChange関数が3回呼ばれることを確認
    expect(mockOnChange).toHaveBeenCalledTimes(3);
    expect(mockOnChange).toHaveBeenLastCalledWith('test-id-123', 'name', 'abc');
  });
});