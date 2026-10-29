// The learner's reminder settings, kept on disk: the practice reminder and its hour, the word of the day, and
// whether the home-screen card was answered. Everything is off until the learner turns it on. Pure zustand (no
// Expo imports) so the planner's tests and the web build can read it; src/features/notify.ts schedules from it.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { storage } from '@/state/storage';

/** The hours a practice reminder can be set to: morning, midday, evening, night. */
export const REMINDER_HOURS = [9, 12, 18, 21] as const;
export type ReminderHour = (typeof REMINDER_HOURS)[number];
export const DEFAULT_REMINDER_HOUR: ReminderHour = 18;
/** The word of the day comes every morning at this hour. */
export const WORD_HOUR = 9;

export interface NotifyPrefs {
  /** The practice reminder on days without practice. */
  reminder: boolean;
  hour: ReminderHour;
  /** The word of the day each morning. */
  wordOfDay: boolean;
}

export interface NotifyState extends NotifyPrefs {
  /** The home-screen card: null = not decided; a timestamp once "Turn on" or "Not now" was tapped. */
  promptAnsweredAt: number | null;
  set: (patch: Partial<Omit<NotifyState, 'set'>>) => void;
}

export const useNotify = create<NotifyState>()(
  persist((set) => ({ reminder: false, hour: DEFAULT_REMINDER_HOUR, wordOfDay: false, promptAnsweredAt: null, set: (patch) => set(patch) }), {
    name: 'eszett.notify',
    storage,
    version: 1,
    partialize: ({ reminder, hour, wordOfDay, promptAnsweredAt }) => ({ reminder, hour, wordOfDay, promptAnsweredAt }),
  }),
);

export const prefsOf = (s: NotifyState): NotifyPrefs => ({ reminder: s.reminder, hour: s.hour, wordOfDay: s.wordOfDay });
