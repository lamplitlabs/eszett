// The learner's written texts: every text sent to the tutor from a writing task, with what the precheck found
// and what the tutor changed, kept so the learner can read them again and see the trend — a portfolio. Only the
// newest hundred stay.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Level } from '@/harness/levels';

import { storage } from './storage';

// strictly increasing, so two entries made in the same millisecond still have an order
let lastStamp = 0;
const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

export interface SavedText {
  id: string;
  taskId: string;
  /** The task's English title at the time, so a tutor-written task that is deleted later still reads. */
  title: string;
  level: Level;
  text: string;
  words: number;
  /** Content points found / asked for by the precheck. */
  pointsHit: number;
  pointsTotal: number;
  /** The precheck passed as a whole (length, points, greeting, register). */
  ok: boolean;
  /** The tutor's corrected text, null when the tutor did not answer or changed nothing. */
  corrected: string | null;
  unchanged: boolean;
  /** The tutor's explanation, as Markdown. */
  explanation: string;
  created: number;
}

export const MAX_TEXTS = 100;

interface TextsState {
  items: Record<string, SavedText>;
  add: (text: Omit<SavedText, 'id' | 'created'>) => SavedText;
  remove: (id: string) => void;
}

function trim(items: Record<string, SavedText>, max: number): Record<string, SavedText> {
  const keys = Object.keys(items);
  if (keys.length <= max) return items;
  const keep = keys.sort((a, b) => items[b].created - items[a].created).slice(0, max);
  return Object.fromEntries(keep.map((k) => [k, items[k]]));
}

export const useTexts = create<TextsState>()(
  persist(
    (set) => ({
      items: {},
      add: (text) => {
        const created = stamp();
        const item: SavedText = { ...text, id: `${created.toString(36)}-${Math.random().toString(36).slice(2, 6)}`, created };
        set((s) => ({ items: trim({ ...s.items, [item.id]: item }, MAX_TEXTS) }));
        return item;
      },
      remove: (id) =>
        set((s) => {
          const next = { ...s.items };
          delete next[id];
          return { items: next };
        }),
    }),
    { name: 'eszett.texts', storage, version: 1 },
  ),
);

/** Newest first. */
export const textsNewestFirst = (items: Record<string, SavedText>): SavedText[] => Object.values(items).sort((a, b) => b.created - a.created);

/** The share of content points found over the last `n` texts, 0..1, or null before any text. */
export function recentPointsRatio(items: Record<string, SavedText>, n = 5): number | null {
  const recent = textsNewestFirst(items).slice(0, n);
  const total = recent.reduce((s, x) => s + x.pointsTotal, 0);
  if (!total) return null;
  return recent.reduce((s, x) => s + x.pointsHit, 0) / total;
}
