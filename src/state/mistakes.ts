// The mistakes notebook: what the learner got wrong in the course's checks, kept so it comes back — a sentence
// from a Lerncheck that was not fixed (kind `fix`), a sentence from Sprechen or Hören that was not said or written
// as it stands (kind `say`). An item leaves the notebook after it has been got right twice. Missed nouns from the
// drills do not come here: they go to the deck (My words), which has its own review.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { storage } from './storage';

// strictly increasing, so two entries made in the same millisecond still have an order
let lastStamp = 0;
const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

export interface Mistake {
  /** `fix:<card>:<pitfall index>` or `say:<normalised sentence>`. */
  key: string;
  kind: 'fix' | 'say';
  /** The sentence to fix (`fix`: as the pitfall has it, wrong) or to say and write again (`say`). */
  text: string;
  /** `fix`: the right sentence. */
  right?: string;
  /** `fix`: the grammar card the pitfall belongs to, and the pitfall's index on it. */
  card?: string;
  index?: number;
  /** `say`: the gloss shown under the sentence, when the source had one. */
  gloss?: string | null;
  /** `say`: where the sentence comes from (a scene or card key). */
  source?: string;
  added: number;
  last: number;
  misses: number;
  /** Right answers in the notebook so far; two in a row and the item leaves. */
  streak: number;
}

/** Right answers in a row that clear an item. */
export const CLEAR_AFTER = 2;
/** How many items the notebook keeps; the oldest go first. */
export const MAX_MISTAKES = 200;

interface MistakesState {
  items: Record<string, Mistake>;
  /** Notes a miss: a new item, or an existing one back to a streak of zero. */
  miss: (m: Omit<Mistake, 'added' | 'last' | 'misses' | 'streak'>) => void;
  /** Notes a right answer in the notebook; returns true when the item has now left. */
  hit: (key: string) => boolean;
  remove: (key: string) => void;
}

export const sayKey = (sentence: string) => `say:${sentence.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;
export const fixKey = (card: string, index: number) => `fix:${card}:${index}`;

/** The newest `max` items by `added`. */
function trim(items: Record<string, Mistake>, max: number): Record<string, Mistake> {
  const keys = Object.keys(items);
  if (keys.length <= max) return items;
  const keep = keys.sort((a, b) => items[b].added - items[a].added).slice(0, max);
  return Object.fromEntries(keep.map((k) => [k, items[k]]));
}

export const useMistakes = create<MistakesState>()(
  persist(
    (set, get) => ({
      items: {},
      miss: (m) =>
        set((s) => {
          const now = stamp();
          const prev = s.items[m.key];
          const item: Mistake = prev
            ? { ...prev, ...m, last: now, misses: prev.misses + 1, streak: 0 }
            : { ...m, added: now, last: now, misses: 1, streak: 0 };
          return { items: trim({ ...s.items, [m.key]: item }, MAX_MISTAKES) };
        }),
      hit: (key) => {
        const prev = get().items[key];
        if (!prev) return false;
        const streak = prev.streak + 1;
        if (streak >= CLEAR_AFTER) {
          set((s) => {
            const next = { ...s.items };
            delete next[key];
            return { items: next };
          });
          return true;
        }
        set((s) => ({ items: { ...s.items, [key]: { ...prev, last: stamp(), streak } } }));
        return false;
      },
      remove: (key) =>
        set((s) => {
          const next = { ...s.items };
          delete next[key];
          return { items: next };
        }),
    }),
    { name: 'eszett.mistakes', storage, version: 1 },
  ),
);

/** The items to work through: the ones missed most recently first, so the fresh mistake is met again soon. */
export const mistakesToReview = (items: Record<string, Mistake>): Mistake[] => Object.values(items).sort((a, b) => b.last - a.last);
