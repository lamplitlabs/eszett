// What the reminders say and when they fire. Pure: tested in node; src/features/notify.ts schedules the result.
// A closed app cannot compute anything, so each sync plans about a week ahead from what is known now (the streak
// as it stands, the words due by then, the word of each coming morning) and the next sync replaces the plan.

import type { Article } from '@/harness/lexicon';
import { tIn, type Vars } from '@/i18n';
import type { AppLang } from '@/i18n/languages';
import { streakOf } from '@/state/progress';
import { dayKey } from '@/state/storage';

import { WORD_HOUR, type NotifyPrefs } from './notifyStore';

export const NOTIFY_RULES = {
  /** Days from today on which a practice reminder is planned when the learner stays away (0 = today). */
  reminderDays: [0, 1, 2, 3, 5],
  /** The last call of a day whose streak would end at midnight; only when the reminder itself comes earlier. */
  rescueHour: 21,
  /** Mornings of the word of the day planned ahead (today + 6). */
  wordDays: 7,
  /** Streak lengths worth a cheer in the next day's reminder. */
  milestones: [3, 7, 14, 30, 50, 100],
} as const;

export interface DayWord {
  lemma: string;
  article: Article;
  meaning: string;
  example?: string;
}

export interface PlanInput {
  prefs: NotifyPrefs;
  /** progress.days: items practised per YYYY-MM-DD. */
  days: Record<string, number>;
  /** `due` timestamps of the deck's words. */
  dueTimes: number[];
  /** The word for a day key, already in the UI language (meaning via wordMeaning); null when none. */
  wordFor: (day: string) => DayWord | null;
  lang: AppLang;
}

export interface PlannedNotification {
  /** Deterministic: `reminder:<dayKey>`, `rescue:<dayKey>` or `word:<dayKey>`; a merged pair keeps the reminder id. */
  id: string;
  /** Fire time, ms since epoch, local time of the device. */
  at: number;
  title: string;
  body: string;
  /** expo-router path to open on tap: '/', '/review', '/word/<encoded lemma>'. */
  url: string;
}

/** Local time `hour`:00:00 on the day `offset` days from `now`. */
export function atHour(now: number, offset: number, hour: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

/** The notifications to schedule from here on, sorted by time; never more than reminderDays.length + 2 + wordDays. */
export function planNotifications(input: PlanInput, now = Date.now()): PlannedNotification[] {
  const { prefs, days, dueTimes, wordFor, lang } = input;
  if (!prefs.reminder && !prefs.wordOfDay) return [];
  const t = (key: string, vars?: Vars) => tIn(lang, key, vars);
  const practisedToday = (days[dayKey(now)] ?? 0) > 0;
  const streak = streakOf(days, now);
  const dueBy = (at: number) => dueTimes.filter((due) => due <= at).length;

  const reminders: PlannedNotification[] = [];
  if (prefs.reminder) {
    for (const d of NOTIFY_RULES.reminderDays) {
      if (d === 0 && practisedToday) continue;
      // the streak still standing at that hour if nothing more is practised: today's, or tomorrow's once today is done
      const alive = d === 0 || (d === 1 && practisedToday) ? streak : 0;
      const at = atHour(now, d, prefs.hour);
      if (at > now) {
        let title: string;
        let body: string;
        if (alive > 0 && (NOTIFY_RULES.milestones as readonly number[]).includes(alive)) {
          title = t('notify.milestoneTitle', { count: alive });
          body = t('notify.milestoneBody', { next: alive + 1 });
        } else if (alive > 0) {
          title = t('notify.streakTitle', { count: alive });
          body = t('notify.streakBody', { next: alive + 1 });
        } else if (streak > 0 && d === (practisedToday ? 2 : 1)) {
          // the first planned day on which the streak is gone
          title = t('notify.freshTitle');
          body = t('notify.freshBody');
        } else {
          const v = (d % 3) + 1;
          title = t(`notify.nudgeTitle${v}`);
          body = t(`notify.nudgeBody${v}`);
        }
        const dueCount = dueBy(at);
        reminders.push({
          id: `reminder:${dayKey(at)}`,
          at,
          title,
          body: dueCount > 0 ? t('notify.dueBody', { count: dueCount }) : body,
          url: dueCount > 0 ? '/review' : '/',
        });
      }
      // the last call: a streak that would end at midnight gets a second reminder late in the evening
      const rescueAt = atHour(now, d, NOTIFY_RULES.rescueHour);
      if (alive > 0 && prefs.hour < NOTIFY_RULES.rescueHour && rescueAt > now) {
        reminders.push({
          id: `rescue:${dayKey(rescueAt)}`,
          at: rescueAt,
          title: t('notify.rescueTitle', { count: alive }),
          body: t('notify.rescueBody'),
          url: dueBy(rescueAt) > 0 ? '/review' : '/',
        });
      }
    }
  }

  const words: PlannedNotification[] = [];
  if (prefs.wordOfDay) {
    for (let d = 0; d < NOTIFY_RULES.wordDays; d++) {
      const at = atHour(now, d, WORD_HOUR);
      if (at <= now) continue;
      const day = dayKey(at);
      const w = wordFor(day);
      if (!w) continue;
      const word = `${w.article} ${w.lemma}`;
      const reminder = reminders.find((r) => r.at === at);
      if (reminder) {
        // one notification for the hour: the reminder, with the word as its first line
        reminder.body = `${t('notify.wordLine', { word, meaning: w.meaning })}\n${reminder.body}`;
        continue;
      }
      words.push({
        id: `word:${day}`,
        at,
        title: t('notify.wordTitle', { word }),
        body: w.example ? `${w.meaning}\n${w.example}` : w.meaning,
        url: `/word/${encodeURIComponent(w.lemma)}`,
      });
    }
  }

  return [...reminders, ...words].sort((a, b) => a.at - b.at);
}

/** Only paths the app knows; anything else returns null (used by the tap handler). */
export function notificationRoute(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const { url } = data as { url?: unknown };
  if (typeof url !== 'string') return null;
  return url === '/' || url === '/review' || /^\/word\/[^/]+$/.test(url) ? url : null;
}
