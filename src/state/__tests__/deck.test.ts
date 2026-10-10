import { describe, expect, it, vi } from 'vitest';

import { tIn } from '@/i18n';

import { dueWords, sourceLabel, useDeck, type DeckWord } from '../deck';

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

describe('deck', () => {
  it('resolves the source of a saved word in the UI language it is shown in, not the one it was saved in', () => {
    const w = { sourceKey: 'drill.titleMeaning' };
    expect(sourceLabel(w, (k, v) => tIn('en', k, v))).toBe('What does it mean?');
    expect(sourceLabel(w, (k, v) => tIn('pl', k, v))).toBe('Co to znaczy?');
    expect(sourceLabel({ sourceKey: 'scene.phraseSource', sourceVars: { title: 'Beim Bäcker' } }, (k, v) => tIn('de', k, v))).toContain('Beim Bäcker');
  });

  it('keeps the text of a word saved before sources were keys', () => {
    expect(sourceLabel({ source: 'What does it mean?' }, (k, v) => tIn('pl', k, v))).toBe('What does it mean?');
    expect(sourceLabel({}, (k, v) => tIn('pl', k, v))).toBe('');
  });

  it('adds a word once and schedules it with the Leitner boxes', () => {
    const deck = useDeck.getState();
    const word: Omit<DeckWord, 'added' | 'box' | 'due' | 'lapses'> = { key: 'noun:Moos', kind: 'noun', german: 'das Moos', article: 'das', lemma: 'Moos', meaning: 'moss', sourceKey: 'drill.titleMeaning' };
    expect(deck.add(word)).toBe(true);
    expect(deck.add(word)).toBe(false);
    expect(dueWords(useDeck.getState().words).map((w) => w.key)).toEqual(['noun:Moos']);
    deck.grade('noun:Moos', true);
    const graded = useDeck.getState().words['noun:Moos'];
    expect(graded.box).toBe(2);
    expect(dueWords(useDeck.getState().words)).toEqual([]);
    deck.grade('noun:Moos', false);
    expect(useDeck.getState().words['noun:Moos']).toMatchObject({ box: 1, lapses: 1 });
  });
});
