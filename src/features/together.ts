// Who the two people practising together are, and how often they met. Names stay on this phone; the
// session itself (which cards, whose turn) lives in the screens, built from the pure state in
// src/harness/together.ts.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ScrabbleState } from '@/harness/scrabble';
import type { TalkPoint, TalkTopic } from '@/harness/together';
import type { WordleState } from '@/harness/wordle';
import { storage } from '@/state/storage';

export type TogetherGame = 'talk' | 'duel' | 'taboo' | 'story' | 'scrabble' | 'wordle' | 'whoami';

export interface TogetherState {
  names: [string, string];
  /** Sessions finished, per activity, for the hub's small print. */
  played: Partial<Record<TogetherGame, number>>;
  /** Questions the model wrote for the players' own topic, handed from the hub to the talk screen (not kept). */
  custom: { title: string; points: TalkPoint[] } | null;
  /** A word-tiles game takes a while, so it is kept until it is over or started afresh. */
  scrabble: ScrabbleState | null;
  /** The Five letters match in progress, kept the same way. */
  wordle: WordleState | null;
  setName: (player: 0 | 1, name: string) => void;
  setCustom: (custom: { title: string; points: TalkPoint[] } | null) => void;
  setScrabble: (game: ScrabbleState | null) => void;
  setWordle: (game: WordleState | null) => void;
  finished: (game: TogetherGame) => void;
}

export const useTogether = create<TogetherState>()(
  persist(
    (set) => ({
      names: ['', ''],
      played: {},
      custom: null,
      scrabble: null,
      wordle: null,
      // the field is controlled, so a space typed between two names must survive; the screens trim on display
      setName: (player, name) =>
        set((s) => {
          const names: [string, string] = [...s.names];
          names[player] = name.replace(/\s+/g, ' ').trimStart().slice(0, 24);
          return { names };
        }),
      setCustom: (custom) => set({ custom }),
      setScrabble: (scrabble) => set({ scrabble }),
      setWordle: (wordle) => set({ wordle }),
      finished: (game) => set((s) => ({ played: { ...s.played, [game]: (s.played[game] ?? 0) + 1 } })),
    }),
    {
      name: 'eszett.together',
      storage,
      version: 3,
      partialize: ({ names, played, scrabble, wordle }) => ({ names, played, scrabble, wordle }),
      migrate: (persisted) => ({ scrabble: null, wordle: null, ...(persisted as Partial<TogetherState>) }),
    },
  ),
);

/** A player's name, or the fallback label ("Player 1") when none was typed. */
export const playerName = (names: [string, string], player: 0 | 1, fallback: (n: number) => string) => names[player].trim() || fallback(player + 1);

const TOPIC_KEYS: Record<TalkTopic, string> = {
  everyday: 'together.topicEveryday',
  food: 'together.topicFood',
  travel: 'together.topicTravel',
  work: 'together.topicWork',
  home: 'together.topicHome',
  people: 'together.topicPeople',
  freetime: 'together.topicFreetime',
  health: 'together.topicHealth',
};

/** The topic's name in the app language; a topic of the players' own is shown as they typed it. */
export const topicLabel = (topic: TalkTopic | 'custom', t: (key: string) => string, custom = '') => (topic === 'custom' ? custom : t(TOPIC_KEYS[topic]));
