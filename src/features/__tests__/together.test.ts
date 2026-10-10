import { describe, expect, it, vi } from 'vitest';

import { playerName, useTogether } from '../together';

// an in-memory AsyncStorage so the persisted store can be imported under node (vi.mock is hoisted above the imports)
vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});

const fallback = (n: number) => `Player ${n}`;

describe('player names', () => {
  it('keeps a space typed between two names, so "Anna Lena" can be entered letter by letter', () => {
    const { setName } = useTogether.getState();
    setName(0, 'Anna ');
    expect(useTogether.getState().names[0]).toBe('Anna ');
    setName(0, 'Anna Lena');
    expect(useTogether.getState().names[0]).toBe('Anna Lena');
  });

  it('tidies what it stores: no leading space, single spaces, at most 24 characters', () => {
    const { setName } = useTogether.getState();
    setName(1, '  Jean   Paul');
    expect(useTogether.getState().names[1]).toBe('Jean Paul');
    setName(1, 'x'.repeat(40));
    expect(useTogether.getState().names[1]).toHaveLength(24);
  });

  it('shows the typed name trimmed, or the numbered fallback when nothing was typed', () => {
    expect(playerName(['Anna ', ''], 0, fallback)).toBe('Anna');
    expect(playerName(['Anna ', ''], 1, fallback)).toBe('Player 2');
    expect(playerName(['', ' '], 1, fallback)).toBe('Player 2');
  });
});
