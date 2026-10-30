// Which moments were celebrated already (src/ui/motion/Celebration.tsx), so each one fires once: the day's
// lesson once a day, a streak milestone once, a finished week once. Pure rules first, the store below them.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Level } from '@/harness/levels';
import { dayKey, storage } from '@/state/storage';

/** Streak lengths worth a moment of their own. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365];

/** The milestone the streak has just reached and not yet celebrated; null when none. */
export function streakMilestoneDue(streak: number, celebrated: number): number | null {
  const due = STREAK_MILESTONES.filter((m) => m <= streak && m > celebrated);
  return due.length ? due[due.length - 1] : null;
}

/** Days since the last day with practice before today; null without any practice, 0 when yesterday or today. */
export function daysAway(days: Record<string, number>, now = Date.now()): number | null {
  const today = dayKey(now);
  const practised = Object.keys(days)
    .filter((k) => days[k] > 0 && k < today)
    .sort();
  if (!practised.length) return null;
  const last = practised[practised.length - 1];
  const [y, m, d] = last.split('-').map(Number);
  const lastMs = new Date(y, m - 1, d).getTime();
  const todayMs = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime();
  return Math.max(0, Math.round((todayMs - lastMs) / 86_400_000) - 1);
}

/** The welcome-back card is for someone away three days or more, who has not practised yet today, once a day. */
export function welcomeBackDue(days: Record<string, number>, shownOn: string | null, now = Date.now()): boolean {
  const today = dayKey(now);
  if (shownOn === today) return false;
  if ((days[today] ?? 0) > 0) return false;
  const away = daysAway(days, now);
  return away !== null && away >= 2;
}

interface MomentsState {
  /** The day the "lesson done" moment was shown. */
  lessonDay: string | null;
  /** The highest streak milestone celebrated. */
  streakCelebrated: number;
  /** Weeks of the course celebrated, per level: how many were finished when the last moment fired. */
  weeksCelebrated: Partial<Record<Level, number>>;
  /** The day the welcome-back card was shown or put away. */
  welcomeShownOn: string | null;
  set: (patch: Partial<Omit<MomentsState, 'set'>>) => void;
}

export const useMoments = create<MomentsState>()(
  persist((set) => ({ lessonDay: null, streakCelebrated: 0, weeksCelebrated: {}, welcomeShownOn: null, set: (patch) => set(patch) }), {
    name: 'eszett.moments',
    storage,
    version: 1,
    partialize: ({ lessonDay, streakCelebrated, weeksCelebrated, welcomeShownOn }) => ({ lessonDay, streakCelebrated, weeksCelebrated, welcomeShownOn }),
  }),
);
