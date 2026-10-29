// The learner's mock oral exams (src/harness/exam.ts): every finished attempt with its parts, ratings and
// points, kept so the trend shows on the exam's overview and the last result on the Practice tab. Only the
// newest twenty stay.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ExamPartResult } from '@/harness/exam';
import type { Level } from '@/harness/levels';

import { storage } from './storage';

let lastStamp = 0;
const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

export interface ExamAttempt {
  id: string;
  level: Level;
  /** Points out of 100, the mean of the rated parts. */
  percent: number;
  parts: ExamPartResult[];
  created: number;
}

export const MAX_ATTEMPTS = 20;

interface ExamsState {
  attempts: Record<string, ExamAttempt>;
  add: (attempt: Omit<ExamAttempt, 'id' | 'created'>) => ExamAttempt;
  remove: (id: string) => void;
}

function trim(items: Record<string, ExamAttempt>, max: number): Record<string, ExamAttempt> {
  const keys = Object.keys(items);
  if (keys.length <= max) return items;
  const keep = keys.sort((a, b) => items[b].created - items[a].created).slice(0, max);
  return Object.fromEntries(keep.map((k) => [k, items[k]]));
}

export const useExams = create<ExamsState>()(
  persist(
    (set) => ({
      attempts: {},
      add: (attempt) => {
        const created = stamp();
        const item: ExamAttempt = { ...attempt, id: `${created.toString(36)}-${Math.random().toString(36).slice(2, 6)}`, created };
        set((s) => ({ attempts: trim({ ...s.attempts, [item.id]: item }, MAX_ATTEMPTS) }));
        return item;
      },
      remove: (id) =>
        set((s) => {
          const next = { ...s.attempts };
          delete next[id];
          return { attempts: next };
        }),
    }),
    { name: 'eszett.exams', storage, version: 1 },
  ),
);

/** Newest first, optionally one level's. */
export const attemptsNewestFirst = (items: Record<string, ExamAttempt>, level?: Level): ExamAttempt[] =>
  Object.values(items)
    .filter((a) => !level || a.level === level)
    .sort((a, b) => b.created - a.created);
