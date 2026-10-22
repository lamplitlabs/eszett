import { Alert } from 'react-native';

import { describe, expect, it, vi } from 'vitest';

import { tIn } from '@/i18n';

import { confirmRemoveWord, dueWords, sourceLabel, useDeck, type DeckWord } from '../deck';

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

// Alert is the native confirm dialog; stub it so the test can inspect the buttons it is offered
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
}));

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

  it('keeps a saved word and its box progress until the learner confirms the delete', () => {
    const deck = useDeck.getState();
    const word: Omit<DeckWord, 'added' | 'box' | 'due' | 'lapses'> = { key: 'noun:Apfel', kind: 'noun', german: 'der Apfel', article: 'der', lemma: 'Apfel', meaning: 'apple', sourceKey: 'drill.titleMeaning' };
    deck.add(word);
    deck.grade('noun:Apfel', true); // move it up a box so there is progress to lose
    const before = useDeck.getState().words['noun:Apfel'];
    expect(before).toBeDefined();

    const strings = { title: 'Remove der Apfel?', message: 'msg', confirm: 'Remove', cancel: 'Cancel' };
    confirmRemoveWord(strings, useDeck.getState().remove, 'noun:Apfel');

    // the dialog was shown…
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [, , buttons] = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
    // …but just asking changed nothing: the word and its box survive until a button is pressed
    expect(useDeck.getState().words['noun:Apfel']).toBe(before);
    expect(useDeck.getState().words['noun:Apfel']?.box).toBe(2);

    // cancel keeps the word
    const cancel = buttons.find((b: { text: string }) => b.text === strings.cancel);
    expect(cancel?.style).toBe('cancel');
    cancel?.onPress?.();
    expect(useDeck.getState().words['noun:Apfel']).toBe(before);

    // only the destructive confirm removes it
    const confirm = buttons.find((b: { text: string }) => b.text === strings.confirm);
    expect(confirm?.style).toBe('destructive');
    confirm?.onPress?.();
    expect(useDeck.getState().words['noun:Apfel']).toBeUndefined();
  });
});
