// What the learner produced out loud: the one-minute talks (src/harness/minute.ts) with their words a minute
// and rating, and the free conversations (src/harness/talk.ts) with how much the learner said. Comprehension
// is counted in src/state/progress.ts; this store counts speaking on its own, so the Me tab can show that the
// learner talks more, and longer, than a month ago. The conversations also leave the partner a memory: the
// last topics and one thing the learner told them, so the next talk can pick up the thread.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ExamRating } from '@/harness/exam';
import type { Level } from '@/harness/levels';

import { dayKey, storage } from './storage';

let lastStamp = 0;
const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

export interface MinuteTalk {
  id: string;
  level: Level;
  /** The prompt's id in MINUTE_PROMPTS, or 'own' for one the learner typed. */
  prompt: string;
  words: number;
  /** Different word forms used. */
  distinct: number;
  seconds: number;
  wpm: number;
  fillers: number;
  /** Null when the tutor could not rate (no model, or an unreadable answer). */
  rating: ExamRating | null;
  fluency: number;
  /** Points out of 100 as the exam counts them; null without a rating. */
  percent: number | null;
  created: number;
}

export interface Chat {
  id: string;
  level: Level;
  /** The topic's id, or 'own'. */
  topic: string;
  /** The topic as shown, German, for the partner's memory. */
  title: string;
  /** The learner's lines. */
  lines: number;
  words: number;
  /** One thing the learner said, kept for the partner to ask about next time (their longest line). */
  told: string;
  created: number;
}

export const MAX_TALKS = 60;
export const MAX_CHATS = 30;

interface SpeakingState {
  talks: Record<string, MinuteTalk>;
  chats: Record<string, Chat>;
  addTalk: (talk: Omit<MinuteTalk, 'id' | 'created'>) => MinuteTalk;
  addChat: (chat: Omit<Chat, 'id' | 'created'>) => Chat;
  reset: () => void;
}

function trim<T extends { created: number }>(items: Record<string, T>, max: number): Record<string, T> {
  const keys = Object.keys(items);
  if (keys.length <= max) return items;
  const keep = keys.sort((a, b) => items[b].created - items[a].created).slice(0, max);
  return Object.fromEntries(keep.map((k) => [k, items[k]]));
}

const newId = (created: number) => `${created.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const useSpeaking = create<SpeakingState>()(
  persist(
    (set) => ({
      talks: {},
      chats: {},
      addTalk: (talk) => {
        const created = stamp();
        const item: MinuteTalk = { ...talk, id: newId(created), created };
        set((s) => ({ talks: trim({ ...s.talks, [item.id]: item }, MAX_TALKS) }));
        return item;
      },
      addChat: (chat) => {
        const created = stamp();
        const item: Chat = { ...chat, id: newId(created), created };
        set((s) => ({ chats: trim({ ...s.chats, [item.id]: item }, MAX_CHATS) }));
        return item;
      },
      reset: () => set({ talks: {}, chats: {} }),
    }),
    { name: 'eszett.speaking', storage, version: 1 },
  ),
);

export const newestFirst = <T extends { created: number }>(items: Record<string, T>): T[] => Object.values(items).sort((a, b) => b.created - a.created);

/** The talk done today, if any: one a day is the habit, more are welcome. */
export const talkToday = (talks: Record<string, MinuteTalk>, now = Date.now()): MinuteTalk | undefined => newestFirst(talks).find((t) => dayKey(t.created) === dayKey(now));

export interface SpeakingSummary {
  talks: number;
  chats: number;
  /** Words said out loud in talks and chats together. */
  words: number;
  /** Words a minute over the last five talks, and over the five before them; null without talks. */
  recentWpm: number | null;
  earlierWpm: number | null;
  bestWpm: number;
  /** Days in a row with a one-minute talk, today or yesterday counting as the start. */
  streak: number;
}

function mean(xs: number[]): number | null {
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

export function summarise(talks: Record<string, MinuteTalk>, chats: Record<string, Chat>, now = Date.now()): SpeakingSummary {
  const list = newestFirst(talks);
  const chatList = Object.values(chats);
  const days = new Set(list.map((t) => dayKey(t.created)));
  let streak = 0;
  // the streak may start today or, before today's talk, yesterday
  let cursor = days.has(dayKey(now)) ? now : now - 86_400_000;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor -= 86_400_000;
  }
  return {
    talks: list.length,
    chats: chatList.length,
    words: list.reduce((n, t) => n + t.words, 0) + chatList.reduce((n, c) => n + c.words, 0),
    recentWpm: mean(list.slice(0, 5).map((t) => t.wpm)),
    earlierWpm: mean(list.slice(5, 10).map((t) => t.wpm)),
    bestWpm: list.reduce((m, t) => Math.max(m, t.wpm), 0),
    streak,
  };
}

/** Words spoken per day over the last `n` days, oldest first, for a small chart. */
export function wordsByDay(talks: Record<string, MinuteTalk>, chats: Record<string, Chat>, n = 14, now = Date.now()): { key: string; words: number }[] {
  const out = Array.from({ length: n }, (_, i) => ({ key: dayKey(now - (n - 1 - i) * 86_400_000), words: 0 }));
  const index = new Map(out.map((d, i) => [d.key, i]));
  for (const t of Object.values(talks)) {
    const i = index.get(dayKey(t.created));
    if (i !== undefined) out[i].words += t.words;
  }
  for (const c of Object.values(chats)) {
    const i = index.get(dayKey(c.created));
    if (i !== undefined) out[i].words += c.words;
  }
  return out;
}

/** What the partner remembers: the last topics (newest first) and the last thing the learner told them. */
export function memoryOf(chats: Record<string, Chat>, n = 3): { topics: string[]; told: string | null } {
  const list = newestFirst(chats);
  const topics: string[] = [];
  for (const c of list) {
    if (!topics.includes(c.title)) topics.push(c.title);
    if (topics.length >= n) break;
  }
  const told = list.find((c) => c.told.trim().length >= 12)?.told ?? null;
  return { topics, told };
}
