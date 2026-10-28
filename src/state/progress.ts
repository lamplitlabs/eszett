import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { dayKey, storage } from './storage';

export type Area =
  | 'article'
  | 'plural'
  | 'meaning'
  | 'verbs'
  | 'numbers'
  | 'clock'
  | 'dates'
  | 'prices'
  | 'ordinals'
  | 'sentence'
  | 'grammar'
  | 'scene'
  | 'writing'
  | 'check'
  | 'ask'
  | 'reading'
  | 'speaking'
  | 'review';

export interface AreaStats {
  seen: number;
  correct: number;
  last: number;
}

export interface Progress {
  /** Items practised per day (YYYY-MM-DD). */
  days: Record<string, number>;
  areas: Partial<Record<Area, AreaStats>>;
  /** Grammar topics opened, scenes finished, writing tasks sent. */
  done: Record<string, number>;
  record: (area: Area, correct?: boolean | null) => void;
  markDone: (key: string) => void;
  reset: () => void;
}

export const useProgress = create<Progress>()(
  persist(
    (set) => ({
      days: {},
      areas: {},
      done: {},
      record: (area, correct = null) =>
        set((s) => {
          const today = dayKey();
          const prev = s.areas[area] ?? { seen: 0, correct: 0, last: 0 };
          return {
            days: { ...s.days, [today]: (s.days[today] ?? 0) + 1 },
            areas: {
              ...s.areas,
              [area]: correct === null ? { ...prev, last: Date.now() } : { seen: prev.seen + 1, correct: prev.correct + (correct ? 1 : 0), last: Date.now() },
            },
          };
        }),
      markDone: (key) => set((s) => ({ done: { ...s.done, [key]: Date.now() } })),
      reset: () => set({ days: {}, areas: {}, done: {} }),
    }),
    { name: 'eszett.progress', storage, version: 1, partialize: ({ days, areas, done }) => ({ days, areas, done }) },
  ),
);

/** Consecutive days with practice, counting today or (if today is still empty) up to yesterday. */
export function streakOf(days: Record<string, number>, now = Date.now()): number {
  let streak = 0;
  let t = now;
  if (!days[dayKey(t)]) t -= 86_400_000;
  while (days[dayKey(t)]) {
    streak += 1;
    t -= 86_400_000;
  }
  return streak;
}

/** Share of correct answers; null until there are a few answers to judge by. */
export const accuracy = (s?: AreaStats) => (s && s.seen >= 3 ? s.correct / s.seen : null);
