// "My words": words the learner saves, and nouns they got wrong in a drill. Reviewed with a five-box
// Leitner schedule: a word you remember moves up a box and comes back later; one you miss starts over.

import { Alert } from 'react-native';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Vars } from '@/i18n';
import type { Article } from '@/harness/lexicon';

import { storage } from './storage';

export interface DeckWord {
  key: string;
  kind: 'noun' | 'verb' | 'phrase';
  /** As shown on the card front: "die Abfahrt", "gehen", "Ich hätte gern …". */
  german: string;
  article?: Article;
  lemma?: string;
  plural?: string;
  meaning: string;
  example?: string;
  /** Where it came from, as an i18n key resolved in the UI language when shown: "drill.titleMeaning", "word.source", "scene.phraseSource" with its {title}. */
  sourceKey?: string;
  sourceVars?: Vars;
  /** Where it came from as it read when the word was saved ("What does it mean?"); words saved before `sourceKey` have only this. */
  source?: string;
  added: number;
  box: number;
  due: number;
  lapses: number;
}

/** The source label in the current UI language; a word saved before `sourceKey` keeps the text it was saved with. */
export const sourceLabel = (w: Pick<DeckWord, 'sourceKey' | 'sourceVars' | 'source'>, t: (key: string, vars?: Vars) => string): string =>
  w.sourceKey ? t(w.sourceKey, w.sourceVars) : (w.source ?? '');

const DAY = 86_400_000;
/** Days until the next review, by box (box 1 comes back within the session). */
export const BOX_DAYS = [0, 0, 1, 3, 7, 21];

export interface Deck {
  words: Record<string, DeckWord>;
  add: (w: Omit<DeckWord, 'added' | 'box' | 'due' | 'lapses'>) => boolean;
  remove: (key: string) => void;
  grade: (key: string, remembered: boolean) => void;
}

export const nounKey = (lemma: string) => `noun:${lemma}`;

/** A saved word is deleted only after the learner confirms; a mis-tap must not lose its box progress. */
export type RemoveConfirmStrings = {
  title: string;
  message: string;
  confirm: string;
  cancel: string;
};

/**
 * Ask before removing a saved word. The word (and its box progress) survives untouched until the
 * learner taps the destructive confirm button; cancel or dismiss leaves the deck unchanged.
 */
export const confirmRemoveWord = (strings: RemoveConfirmStrings, remove: (key: string) => void, key: string) =>
  Alert.alert(strings.title, strings.message, [
    { text: strings.cancel, style: 'cancel' },
    { text: strings.confirm, style: 'destructive', onPress: () => remove(key) },
  ]);

export const useDeck = create<Deck>()(
  persist(
    (set, get) => ({
      words: {},
      add: (w) => {
        if (get().words[w.key]) return false;
        set((s) => ({ words: { ...s.words, [w.key]: { ...w, added: Date.now(), box: 1, due: Date.now(), lapses: 0 } } }));
        return true;
      },
      remove: (key) =>
        set((s) => {
          const next = { ...s.words };
          delete next[key];
          return { words: next };
        }),
      grade: (key, remembered) =>
        set((s) => {
          const w = s.words[key];
          if (!w) return s;
          const box = remembered ? Math.min(5, w.box + 1) : 1;
          const due = remembered ? Date.now() + BOX_DAYS[box] * DAY : Date.now() + 10 * 60_000;
          return { words: { ...s.words, [key]: { ...w, box, due, lapses: w.lapses + (remembered ? 0 : 1) } } };
        }),
    }),
    { name: 'eszett.deck', storage, version: 1, partialize: ({ words }) => ({ words }) },
  ),
);

export const dueWords = (words: Record<string, DeckWord>, now = Date.now()) =>
  Object.values(words)
    .filter((w) => w.due <= now)
    .sort((a, b) => a.due - b.due);
