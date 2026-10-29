import { describe, expect, it, vi } from 'vitest';

import { tIn, type Vars } from '@/i18n';
import { dayKey } from '@/state/storage';

import { atHour, NOTIFY_RULES, notificationRoute, planNotifications, type DayWord, type PlanInput } from '../notifyRules';
import { WORD_HOUR, type NotifyPrefs } from '../notifyStore';

// an in-memory AsyncStorage so the persisted stores can be imported under node (vi.mock is hoisted above the imports)
vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});

const DAY = 86_400_000;
// a Saturday at noon: the 9:00 word is gone, the 18:00 reminder still ahead
const NOW = new Date(2026, 9, 17, 12, 0).getTime();
const TODAY = dayKey(NOW);

const en = (key: string, vars?: Vars) => tIn('en', key, vars);
const both: NotifyPrefs = { reminder: true, wordOfDay: true, hour: 18 };
const reminderOnly: NotifyPrefs = { reminder: true, wordOfDay: false, hour: 18 };
const wordOnly: NotifyPrefs = { reminder: false, wordOfDay: true, hour: 18 };

/** `n` consecutive practised days ending `endOffset` days before now (0 = today). */
function streakDays(n: number, endOffset = 0, now = NOW): Record<string, number> {
  const days: Record<string, number> = {};
  for (let i = 0; i < n; i++) days[dayKey(now - (endOffset + i) * DAY)] = 1 + i;
  return days;
}

const wordFor = (day: string): DayWord => ({ lemma: `Wort${day}`, article: 'das', meaning: `meaning ${day}`, example: `Beispiel ${day}.` });

const input = (over: Partial<PlanInput> = {}): PlanInput => ({ prefs: both, days: {}, dueTimes: [], wordFor, lang: 'en', ...over });

const reminders = (list: ReturnType<typeof planNotifications>) => list.filter((n) => n.id.startsWith('reminder:'));
const rescues = (list: ReturnType<typeof planNotifications>) => list.filter((n) => n.id.startsWith('rescue:'));
const words = (list: ReturnType<typeof planNotifications>) => list.filter((n) => n.id.startsWith('word:'));

describe('atHour', () => {
  it('gives the local hour on the day `offset` days from now', () => {
    expect(atHour(NOW, 0, 18)).toBe(new Date(2026, 9, 17, 18).getTime());
    expect(atHour(NOW, 2, 9)).toBe(new Date(2026, 9, 19, 9).getTime());
    expect(atHour(new Date(2026, 9, 31, 23, 59).getTime(), 1, 9)).toBe(new Date(2026, 10, 1, 9).getTime());
  });
});

describe('planNotifications', () => {
  it('plans nothing when both kinds are off', () => {
    expect(planNotifications(input({ prefs: { reminder: false, wordOfDay: false, hour: 18 } }), NOW)).toEqual([]);
  });

  it('plans a reminder for today and the days ahead, skipping today once practised or once the hour is past', () => {
    const fresh = reminders(planNotifications(input({ prefs: reminderOnly }), NOW));
    expect(fresh.map((n) => n.id)).toEqual(NOTIFY_RULES.reminderDays.map((d) => `reminder:${dayKey(NOW + d * DAY)}`));
    expect(fresh.map((n) => n.at)).toEqual(NOTIFY_RULES.reminderDays.map((d) => atHour(NOW, d, 18)));

    const practised = reminders(planNotifications(input({ prefs: reminderOnly, days: { [TODAY]: 3 } }), NOW));
    expect(practised.map((n) => n.id)).not.toContain(`reminder:${TODAY}`);
    expect(practised).toHaveLength(NOTIFY_RULES.reminderDays.length - 1);

    const evening = reminders(planNotifications(input({ prefs: reminderOnly }), new Date(2026, 9, 17, 18, 30).getTime()));
    expect(evening.map((n) => n.id)).not.toContain(`reminder:${TODAY}`);
    expect(evening).toHaveLength(NOTIFY_RULES.reminderDays.length - 1);
  });

  it('keeps the streak alive today, then offers a fresh start on the first day it would be gone', () => {
    const [today, tomorrow, day2, day3, day5] = reminders(planNotifications(input({ prefs: reminderOnly, days: streakDays(4, 1) }), NOW));
    expect(today.title).toBe(en('notify.streakTitle', { count: 4 }));
    expect(today.body).toBe(en('notify.streakBody', { next: 5 }));
    expect(tomorrow.title).toBe(en('notify.freshTitle'));
    expect(tomorrow.body).toBe(en('notify.freshBody'));
    expect([day2.title, day3.title, day5.title]).toEqual([en('notify.nudgeTitle3'), en('notify.nudgeTitle1'), en('notify.nudgeTitle3')]);
    expect([day2.body, day3.body, day5.body]).toEqual([en('notify.nudgeBody3'), en('notify.nudgeBody1'), en('notify.nudgeBody3')]);
    expect(reminders(planNotifications(input({ prefs: reminderOnly, days: streakDays(4, 1) }), NOW)).filter((n) => n.title === en('notify.freshTitle'))).toHaveLength(1);
  });

  it('cheers a milestone streak', () => {
    const [today] = reminders(planNotifications(input({ prefs: reminderOnly, days: streakDays(7, 1) }), NOW));
    expect(today.title).toBe(en('notify.milestoneTitle', { count: 7 }));
    expect(today.body).toBe(en('notify.milestoneBody', { next: 8 }));
  });

  it('after practice today, tomorrow carries the streak and the day after offers the fresh start', () => {
    const [tomorrow, day2, day3, day5] = reminders(planNotifications(input({ prefs: reminderOnly, days: streakDays(2) }), NOW));
    expect(tomorrow.id).toBe(`reminder:${dayKey(NOW + DAY)}`);
    expect(tomorrow.title).toBe(en('notify.streakTitle', { count: 2 }));
    expect(tomorrow.body).toBe(en('notify.streakBody', { next: 3 }));
    expect(day2.title).toBe(en('notify.freshTitle'));
    expect([day3.title, day5.title]).toEqual([en('notify.nudgeTitle1'), en('notify.nudgeTitle3')]);
  });

  it('adds a last call in the evening of a day whose streak would end at midnight', () => {
    const list = planNotifications(input({ prefs: reminderOnly, days: streakDays(4, 1) }), NOW);
    expect(rescues(list)).toEqual([
      {
        id: `rescue:${TODAY}`,
        at: atHour(NOW, 0, NOTIFY_RULES.rescueHour),
        title: en('notify.rescueTitle', { count: 4 }),
        body: en('notify.rescueBody'),
        url: '/',
      },
    ]);
    expect(list.map((n) => n.at)).toEqual([...list.map((n) => n.at)].sort((a, b) => a - b));
    // after practice today the streak lives on: the last call moves to tomorrow
    const tomorrow = rescues(planNotifications(input({ prefs: reminderOnly, days: streakDays(2) }), NOW));
    expect(tomorrow.map((n) => n.id)).toEqual([`rescue:${dayKey(NOW + DAY)}`]);
    expect(tomorrow[0].title).toBe(en('notify.rescueTitle', { count: 2 }));
    expect(tomorrow[0].at).toBe(atHour(NOW, 1, NOTIFY_RULES.rescueHour));
    // the milestone cheer and the last call go together
    expect(rescues(planNotifications(input({ prefs: reminderOnly, days: streakDays(7, 1) }), NOW))[0].title).toBe(en('notify.rescueTitle', { count: 7 }));
  });

  it('makes no last call without a streak, when the reminder is the last call itself, or once the evening is past', () => {
    expect(rescues(planNotifications(input({ prefs: reminderOnly }), NOW))).toEqual([]);
    expect(rescues(planNotifications(input({ prefs: { ...reminderOnly, hour: 21 }, days: streakDays(4, 1) }), NOW))).toEqual([]);
    // the 18:00 reminder is gone but the evening is not: the last call still stands
    const evening = planNotifications(input({ prefs: reminderOnly, days: streakDays(4, 1) }), new Date(2026, 9, 17, 19, 0).getTime());
    expect(evening.map((n) => n.id)).not.toContain(`reminder:${TODAY}`);
    expect(rescues(evening).map((n) => n.id)).toEqual([`rescue:${TODAY}`]);
    expect(rescues(planNotifications(input({ prefs: reminderOnly, days: streakDays(4, 1) }), new Date(2026, 9, 17, 21, 30).getTime()))).toEqual([]);
    // words due by the evening send the tap to the review; the body stays the last call
    const [due] = rescues(planNotifications(input({ prefs: reminderOnly, days: streakDays(4, 1), dueTimes: [atHour(NOW, 0, 20)] }), NOW));
    expect(due.url).toBe('/review');
    expect(due.body).toBe(en('notify.rescueBody'));
  });

  it('rotates the encouragement by day when there is no streak', () => {
    const list = reminders(planNotifications(input({ prefs: reminderOnly }), NOW));
    expect(list.map((n) => n.title)).toEqual([1, 2, 3, 1, 3].map((v) => en(`notify.nudgeTitle${v}`)));
    expect(list.map((n) => n.body)).toEqual([1, 2, 3, 1, 3].map((v) => en(`notify.nudgeBody${v}`)));
    expect(list.every((n) => n.url === '/')).toBe(true);
  });

  it('points at the review when words are due by the reminder, leaving the title alone', () => {
    const dueTimes = [NOW - 1000, atHour(NOW, 1, 12)];
    const [today, tomorrow, day2] = reminders(planNotifications(input({ prefs: reminderOnly, days: streakDays(4, 1), dueTimes }), NOW));
    expect(today.title).toBe(en('notify.streakTitle', { count: 4 }));
    expect(today.body).toBe(en('notify.dueBody', { count: 1 }));
    expect(today.url).toBe('/review');
    expect(tomorrow.body).toBe(en('notify.dueBody', { count: 2 }));
    expect(tomorrow.url).toBe('/review');
    expect(day2.url).toBe('/review');
    const later = reminders(planNotifications(input({ prefs: reminderOnly, dueTimes: [atHour(NOW, 2, 19)] }), NOW));
    expect(later.slice(0, 3).map((n) => n.url)).toEqual(['/', '/', '/']);
    expect(later[3].url).toBe('/review');
  });

  it('speaks the given language', () => {
    const [today] = reminders(planNotifications(input({ prefs: reminderOnly, days: streakDays(4, 1), lang: 'de' }), NOW));
    expect(today.title).toBe(tIn('de', 'notify.streakTitle', { count: 4 }));
    expect(today.body).toBe(tIn('de', 'notify.streakBody', { next: 5 }));
  });

  it('plans the word of each coming morning from the day key, skipping mornings already past', () => {
    const list = words(planNotifications(input({ prefs: wordOnly }), NOW));
    expect(list).toHaveLength(NOTIFY_RULES.wordDays - 1);
    const day = dayKey(NOW + DAY);
    expect(list[0]).toEqual({
      id: `word:${day}`,
      at: atHour(NOW, 1, WORD_HOUR),
      title: en('notify.wordTitle', { word: `das Wort${day}` }),
      body: `meaning ${day}\nBeispiel ${day}.`,
      url: `/word/${encodeURIComponent(`Wort${day}`)}`,
    });
    const early = words(planNotifications(input({ prefs: wordOnly }), new Date(2026, 9, 17, 8, 0).getTime()));
    expect(early).toHaveLength(NOTIFY_RULES.wordDays);
    expect(early[0].id).toBe(`word:${TODAY}`);
    const bare = words(planNotifications(input({ prefs: wordOnly, wordFor: (d) => ({ lemma: 'Straße', article: 'die', meaning: `street ${d}` }) }), NOW));
    expect(bare[0].body).toBe(`street ${day}`);
    expect(bare[0].url).toBe('/word/Stra%C3%9Fe');
    expect(planNotifications(input({ prefs: wordOnly, wordFor: () => null }), NOW)).toEqual([]);
  });

  it('merges a reminder and a word due at the same moment into one notification', () => {
    const morning = new Date(2026, 9, 17, 8, 0).getTime();
    const list = planNotifications(input({ prefs: { ...both, hour: 9 }, days: streakDays(4, 1) }), morning);
    // five merged mornings, two plain words, and the last call of today
    expect(list).toHaveLength(NOTIFY_RULES.wordDays + 1);
    expect(rescues(list).map((n) => n.id)).toEqual([`rescue:${TODAY}`]);
    const merged = list[0];
    expect(merged.id).toBe(`reminder:${TODAY}`);
    expect(merged.at).toBe(atHour(morning, 0, 9));
    expect(merged.title).toBe(en('notify.streakTitle', { count: 4 }));
    expect(merged.url).toBe('/');
    expect(merged.body).toBe(`${en('notify.wordLine', { word: `das Wort${TODAY}`, meaning: `meaning ${TODAY}` })}\n${en('notify.streakBody', { next: 5 })}`);
    expect(list.filter((n) => n.id.startsWith('word:')).map((n) => n.id)).toEqual([4, 6].map((d) => `word:${dayKey(morning + d * DAY)}`));
  });

  it('returns the plan sorted by time and bounded', () => {
    const morning = new Date(2026, 9, 17, 8, 0).getTime();
    for (const now of [NOW, morning]) {
      const list = planNotifications(input({ days: streakDays(3, 1), dueTimes: [now] }), now);
      expect(list.length).toBeLessThanOrEqual(NOTIFY_RULES.reminderDays.length + 2 + NOTIFY_RULES.wordDays);
      expect(list.map((n) => n.at)).toEqual([...list.map((n) => n.at)].sort((a, b) => a - b));
      expect(new Set(list.map((n) => n.id)).size).toBe(list.length);
      expect(list.every((n) => n.at > now)).toBe(true);
    }
  });
});

describe('notificationRoute', () => {
  it('lets only the app’s own paths through', () => {
    expect(notificationRoute({ url: '/' })).toBe('/');
    expect(notificationRoute({ url: '/review' })).toBe('/review');
    expect(notificationRoute({ url: '/word/Abfahrt' })).toBe('/word/Abfahrt');
    expect(notificationRoute({ url: '/word/Stra%C3%9Fe' })).toBe('/word/Stra%C3%9Fe');
    expect(notificationRoute({ url: '/word/' })).toBeNull();
    expect(notificationRoute({ url: '/word/a/b' })).toBeNull();
    expect(notificationRoute({ url: '/model' })).toBeNull();
    expect(notificationRoute({ url: 'https://example.com/' })).toBeNull();
    expect(notificationRoute({ url: 42 })).toBeNull();
    expect(notificationRoute({})).toBeNull();
    expect(notificationRoute('/review')).toBeNull();
    expect(notificationRoute(null)).toBeNull();
    expect(notificationRoute(undefined)).toBeNull();
  });
});
