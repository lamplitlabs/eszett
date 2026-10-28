import * as Notifications from 'expo-notifications';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { wordOfDay } from '@/features/wordOfDay';
import { setLanguage, tIn } from '@/i18n';
import { useDeck, type DeckWord } from '@/state/deck';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { dayKey } from '@/state/storage';

import { CHANNEL_REMINDERS, CHANNEL_WORDS, enableNotifications, notificationPermission, openNotificationSettings, syncNotifications } from '../notify';
import { atHour, NOTIFY_RULES, planNotifications, type DayWord, type PlanInput, type PlannedNotification } from '../notifyRules';
import { useNotify, type NotifyPrefs } from '../notifyStore';

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

// the parts of react-native the module touches; hoisted so the tests can switch Platform.OS
const rn = vi.hoisted(() => ({
  Platform: { OS: 'ios' as 'ios' | 'android' },
  Linking: { openSettings: vi.fn(async () => undefined) },
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
vi.mock('react-native', () => rn);

vi.mock('expo-router', () => ({
  router: { push: vi.fn() },
  useNavigationContainerRef: () => ({ isReady: () => true, addListener: () => () => {} }),
}));

// the system says yes unless a test answers otherwise; the enum values mirror expo-notifications 57 (build/*.types.d.ts)
vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: vi.fn(async () => ({ granted: true, canAskAgain: false, ios: { status: 2 } })),
  requestPermissionsAsync: vi.fn(async () => ({ granted: true, canAskAgain: false, ios: { status: 2 } })),
  setNotificationChannelAsync: vi.fn(async () => null),
  cancelAllScheduledNotificationsAsync: vi.fn(async () => undefined),
  scheduleNotificationAsync: vi.fn(async () => 'scheduled'),
  getLastNotificationResponse: vi.fn(() => null),
  clearLastNotificationResponse: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  AndroidImportance: { UNKNOWN: 0, UNSPECIFIED: 1, NONE: 2, MIN: 3, LOW: 4, DEFAULT: 5, HIGH: 6, MAX: 7 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// the real module reaches the on-device model runtime (the llama engine), which node cannot load
vi.mock('@/features/wordOfDay', () => ({
  wordOfDay: vi.fn(() => ({ lemma: 'Apfel', genus: 'm', plural: ['Äpfel'], meaning: 'apple', example: 'Der Apfel ist rot.' })),
}));

// the handler is installed when the module is imported; captured here because Vitest clears every mock's calls before each test
const foregroundHandler = vi.mocked(Notifications.setNotificationHandler).mock.calls[0]?.[0];

const DAY = 86_400_000;
// a Saturday at noon: the 9:00 word is gone, the 18:00 reminder still ahead
const NOW = new Date(2026, 9, 17, 12, 0).getTime();
const TODAY = dayKey(NOW);

const { AUTHORIZED, PROVISIONAL, EPHEMERAL, DENIED, NOT_DETERMINED } = Notifications.IosAuthorizationStatus;

// only the fields the module reads: iOS answers in grades under `ios`, Android with granted/canAskAgain. The iOS
// answer keeps the plain fields at "ask again" so a result other than undetermined proves the grade was read.
const onIos = (status: Notifications.IosAuthorizationStatus) => ({ granted: false, canAskAgain: true, ios: { status } }) as unknown as Notifications.NotificationPermissionsStatus;
const onAndroid = (granted: boolean, canAskAgain = true) => ({ granted, canAskAgain }) as unknown as Notifications.NotificationPermissionsStatus;

const getPermissions = vi.mocked(Notifications.getPermissionsAsync);
const requestPermissions = vi.mocked(Notifications.requestPermissionsAsync);
const setChannel = vi.mocked(Notifications.setNotificationChannelAsync);
const cancelAll = vi.mocked(Notifications.cancelAllScheduledNotificationsAsync);
const schedule = vi.mocked(Notifications.scheduleNotificationAsync);

const scheduled = () => schedule.mock.calls.map(([request]) => request);
const scheduledIds = () => scheduled().map((r) => r.identifier);

const reminderOnly: NotifyPrefs = { reminder: true, wordOfDay: false, hour: 18 };
const wordOnly: NotifyPrefs = { reminder: false, wordOfDay: true, hour: 18 };
const both: NotifyPrefs = { reminder: true, wordOfDay: true, hour: 18 };

/** The mocked word of the day as the planner receives it: the article from the genus, the meaning in the UI language. */
const apfel = (meaning = 'apple'): DayWord => ({ lemma: 'Apfel', article: 'der', meaning, example: 'Der Apfel ist rot.' });

const plan = (prefs: NotifyPrefs, over: Partial<PlanInput> = {}) => planNotifications({ prefs, days: {}, dueTimes: [], wordFor: () => apfel(), lang: 'en', ...over }, NOW);

/** What the module is expected to hand expo-notifications for a planned notification. */
function requestOf(n: PlannedNotification): Notifications.NotificationRequestInput {
  const word = n.id.startsWith('word:');
  return {
    identifier: n.id,
    content: { title: n.title, body: n.body, data: { url: n.url }, sound: word ? false : 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: word ? CHANNEL_WORDS : CHANNEL_REMINDERS },
  };
}

const noonOf = (at: number) => new Date(at).setHours(12, 0, 0, 0);

const moos: DeckWord = { key: 'noun:Moos', kind: 'noun', german: 'das Moos', article: 'das', lemma: 'Moos', meaning: 'moss', added: NOW - DAY, box: 1, due: NOW - 1000, lapses: 0 };

beforeAll(async () => {
  vi.setSystemTime(NOW);
  await Promise.all([useNotify.persist.rehydrate(), useSettings.persist.rehydrate(), useProgress.persist.rehydrate(), useDeck.persist.rehydrate()]);
  expect(useNotify.persist.hasHydrated()).toBe(true);
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  // back to the factory implementations, dropping any one-off answer a test left behind
  vi.resetAllMocks();
  rn.Platform.OS = 'ios';
  setLanguage('en');
  useNotify.setState({ reminder: false, hour: 18, wordOfDay: false, promptAnsweredAt: null });
  useSettings.setState({ level: 'A2' });
  useProgress.setState({ days: {} });
  useDeck.setState({ words: {} });
});

describe('the foreground handler', () => {
  it('is installed once at import and shows nothing while the app is open', async () => {
    expect(foregroundHandler).toBeTruthy();
    await expect(foregroundHandler?.handleNotification({} as Notifications.Notification)).resolves.toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });
});

describe('notificationPermission', () => {
  it('reads the iOS grades: authorised, provisional and ephemeral all count as granted', async () => {
    for (const status of [AUTHORIZED, PROVISIONAL, EPHEMERAL]) {
      getPermissions.mockResolvedValueOnce(onIos(status));
      expect(await notificationPermission()).toBe('granted');
    }
    getPermissions.mockResolvedValueOnce(onIos(DENIED));
    expect(await notificationPermission()).toBe('denied');
    getPermissions.mockResolvedValueOnce(onIos(NOT_DETERMINED));
    expect(await notificationPermission()).toBe('undetermined');
  });

  it('reads the Android yes/no, undetermined only while the system still lets the app ask', async () => {
    getPermissions.mockResolvedValueOnce(onAndroid(true));
    expect(await notificationPermission()).toBe('granted');
    getPermissions.mockResolvedValueOnce(onAndroid(false, true));
    expect(await notificationPermission()).toBe('undetermined');
    getPermissions.mockResolvedValueOnce(onAndroid(false, false));
    expect(await notificationPermission()).toBe('denied');
  });

  it('answers unavailable instead of throwing when the module is missing', async () => {
    getPermissions.mockRejectedValueOnce(new Error('ExpoNotifications is not available'));
    await expect(notificationPermission()).resolves.toBe('unavailable');
  });
});

describe('enableNotifications', () => {
  it('asks once while undetermined and, once granted, turns on both kinds by default and syncs', async () => {
    getPermissions.mockResolvedValueOnce(onIos(NOT_DETERMINED));
    requestPermissions.mockResolvedValueOnce(onIos(AUTHORIZED));
    await expect(enableNotifications()).resolves.toBe('granted');
    expect(requestPermissions).toHaveBeenCalledTimes(1);
    expect(requestPermissions).toHaveBeenCalledWith({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    expect(useNotify.getState()).toMatchObject({ reminder: true, wordOfDay: true, hour: 18, promptAnsweredAt: NOW });
    expect(cancelAll).toHaveBeenCalledTimes(1);
    expect(scheduledIds()).toEqual(plan(both).map((n) => n.id));
  });

  it('turns on only what was asked for', async () => {
    getPermissions.mockResolvedValueOnce(onIos(NOT_DETERMINED));
    requestPermissions.mockResolvedValueOnce(onIos(AUTHORIZED));
    await expect(enableNotifications({ reminder: true })).resolves.toBe('granted');
    expect(useNotify.getState()).toMatchObject({ reminder: true, wordOfDay: false, promptAnsweredAt: NOW });
    expect(scheduledIds()).toEqual(plan(reminderOnly).map((n) => n.id));
  });

  it('does not ask again when the permission is already granted', async () => {
    getPermissions.mockResolvedValueOnce(onIos(PROVISIONAL));
    await expect(enableNotifications()).resolves.toBe('granted');
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(useNotify.getState()).toMatchObject({ reminder: true, wordOfDay: true, promptAnsweredAt: NOW });
  });

  it('records the answer but leaves the prefs off when the permission is denied', async () => {
    getPermissions.mockResolvedValueOnce(onIos(DENIED));
    await expect(enableNotifications()).resolves.toBe('denied');
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(useNotify.getState()).toMatchObject({ reminder: false, wordOfDay: false, promptAnsweredAt: NOW });
    expect(cancelAll).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('records the answer when the learner refuses the prompt', async () => {
    getPermissions.mockResolvedValueOnce(onIos(NOT_DETERMINED));
    requestPermissions.mockResolvedValueOnce(onIos(DENIED));
    await expect(enableNotifications()).resolves.toBe('denied');
    expect(useNotify.getState()).toMatchObject({ reminder: false, wordOfDay: false, promptAnsweredAt: NOW });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('creates the Android channels before the system prompt', async () => {
    rn.Platform.OS = 'android';
    getPermissions.mockResolvedValueOnce(onAndroid(false, true));
    requestPermissions.mockResolvedValueOnce(onAndroid(true));
    await expect(enableNotifications()).resolves.toBe('granted');
    expect(setChannel.mock.calls.slice(0, 2).map(([id]) => id)).toEqual([CHANNEL_REMINDERS, CHANNEL_WORDS]);
    expect(Math.max(...setChannel.mock.invocationCallOrder.slice(0, 2))).toBeLessThan(requestPermissions.mock.invocationCallOrder[0]);
    expect(useNotify.getState()).toMatchObject({ reminder: true, wordOfDay: true, promptAnsweredAt: NOW });
  });

  it('resolves unavailable and saves nothing but the answer when the module throws', async () => {
    getPermissions.mockRejectedValueOnce(new Error('ExpoNotifications is not available'));
    await expect(enableNotifications()).resolves.toBe('unavailable');
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(useNotify.getState()).toMatchObject({ reminder: false, wordOfDay: false, promptAnsweredAt: NOW });
    expect(schedule).not.toHaveBeenCalled();
  });
});

describe('syncNotifications', () => {
  it('cancels the pending notifications on every sync, even with everything off', async () => {
    await syncNotifications(NOW);
    expect(cancelAll).toHaveBeenCalledTimes(1);
    expect(getPermissions).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('schedules nothing without the permission', async () => {
    useNotify.setState({ reminder: true, wordOfDay: true });
    getPermissions.mockResolvedValueOnce(onIos(DENIED));
    await syncNotifications(NOW);
    expect(cancelAll).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('waits for the saved prefs before touching anything', async () => {
    const hydrated = vi.spyOn(useNotify.persist, 'hasHydrated').mockReturnValue(false);
    useNotify.setState({ reminder: true });
    await syncNotifications(NOW);
    hydrated.mockRestore();
    expect(cancelAll).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('schedules the planned reminders as dated notifications on the reminders channel', async () => {
    useNotify.setState({ reminder: true });
    await syncNotifications(NOW);
    const expected = plan(reminderOnly);
    expect(expected).toHaveLength(NOTIFY_RULES.reminderDays.length);
    expect(scheduled()).toEqual(expected.map(requestOf));
    expect(scheduled()[0]).toMatchObject({
      identifier: `reminder:${TODAY}`,
      content: { sound: 'default', data: { url: '/' } },
      trigger: { type: 'date', date: atHour(NOW, 0, 18), channelId: CHANNEL_REMINDERS },
    });
    for (const r of scheduled()) {
      expect(r.identifier).toMatch(/^reminder:\d{4}-\d{2}-\d{2}$/);
      expect(r.trigger).toMatchObject({ type: 'date', date: expect.any(Number), channelId: CHANNEL_REMINDERS });
      expect((r.trigger as { date: number }).date).toBeGreaterThan(NOW);
    }
  });

  it('schedules the word of each coming morning, silent, on the words channel, opening the word', async () => {
    useNotify.setState({ wordOfDay: true });
    await syncNotifications(NOW);
    const expected = plan(wordOnly);
    expect(expected).toHaveLength(NOTIFY_RULES.wordDays - 1);
    expect(scheduled()).toEqual(expected.map(requestOf));
    for (const r of scheduled()) {
      expect(r.identifier).toMatch(/^word:\d{4}-\d{2}-\d{2}$/);
      expect(r.content.title).toBe(tIn('en', 'notify.wordTitle', { word: 'der Apfel' }));
      expect(r.content.title).toContain('der Apfel');
      expect(r.content).toMatchObject({ body: 'apple\nDer Apfel ist rot.', sound: false, data: { url: '/word/Apfel' } });
      expect(r.trigger).toMatchObject({ type: 'date', channelId: CHANNEL_WORDS });
    }
    // the word is the level's word for each day, looked up at local noon
    expect(vi.mocked(wordOfDay).mock.calls).toEqual(expected.map((n) => ['A2', noonOf(n.at)]));
  });

  it('skips a morning without a word', async () => {
    useNotify.setState({ wordOfDay: true });
    vi.mocked(wordOfDay).mockReturnValue(null);
    await syncNotifications(NOW);
    expect(cancelAll).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('feeds the planner the stores: today’s practice, the words due, the level and the language', async () => {
    useNotify.setState({ reminder: true, wordOfDay: true, hour: 21 });
    useProgress.setState({ days: { [TODAY]: 3 } });
    useDeck.setState({ words: { [moos.key]: moos } });
    useSettings.setState({ level: 'B1' });
    setLanguage('fr');
    await syncNotifications(NOW);
    const prefs: NotifyPrefs = { reminder: true, wordOfDay: true, hour: 21 };
    const expected = plan(prefs, { days: { [TODAY]: 3 }, dueTimes: [moos.due], wordFor: () => apfel('pomme'), lang: 'fr' });
    expect(scheduled()).toEqual(expected.map(requestOf));
    expect(scheduledIds()).not.toContain(`reminder:${TODAY}`);
    const tomorrow = scheduled().find((r) => r.identifier === `reminder:${dayKey(NOW + DAY)}`);
    expect(tomorrow?.content).toMatchObject({ body: tIn('fr', 'notify.dueBody', { count: 1 }), data: { url: '/review' } });
    const word = scheduled().find((r) => r.identifier === `word:${dayKey(NOW + DAY)}`);
    expect(word?.content).toMatchObject({ title: tIn('fr', 'notify.wordTitle', { word: 'der Apfel' }), body: 'pomme\nDer Apfel ist rot.' });
    expect(vi.mocked(wordOfDay)).toHaveBeenCalledWith('B1', expect.any(Number));
  });

  it('sets the Android channels again on every sync, in the app language, before scheduling', async () => {
    rn.Platform.OS = 'android';
    useNotify.setState({ reminder: true });
    getPermissions.mockResolvedValueOnce(onAndroid(true));
    await syncNotifications(NOW);
    expect(setChannel.mock.calls).toEqual([
      [CHANNEL_REMINDERS, { name: tIn('en', 'notify.channelReminders'), importance: Notifications.AndroidImportance.DEFAULT }],
      [CHANNEL_WORDS, { name: tIn('en', 'notify.channelWords'), importance: Notifications.AndroidImportance.LOW }],
    ]);
    expect(Math.max(...setChannel.mock.invocationCallOrder)).toBeLessThan(schedule.mock.invocationCallOrder[0]);
    expect(schedule).toHaveBeenCalledTimes(NOTIFY_RULES.reminderDays.length);
  });

  it('never rejects, and a failed sync does not block the next', async () => {
    useNotify.setState({ reminder: true });
    schedule.mockRejectedValueOnce(new Error('too many pending notifications'));
    await expect(syncNotifications(NOW)).resolves.toBeUndefined();
    cancelAll.mockRejectedValueOnce(new Error('ExpoNotifications is not available'));
    await expect(syncNotifications(NOW)).resolves.toBeUndefined();
    await syncNotifications(NOW);
    expect(cancelAll).toHaveBeenCalledTimes(3);
    expect(schedule).toHaveBeenCalledTimes(1 + NOTIFY_RULES.reminderDays.length);
  });

  it('runs overlapping syncs one after the other', async () => {
    useNotify.setState({ reminder: true });
    await Promise.all([syncNotifications(NOW), syncNotifications(NOW)]);
    const n = NOTIFY_RULES.reminderDays.length;
    expect(cancelAll).toHaveBeenCalledTimes(2);
    expect(schedule).toHaveBeenCalledTimes(2 * n);
    const secondCancel = cancelAll.mock.invocationCallOrder[1];
    expect(secondCancel).toBeGreaterThan(schedule.mock.invocationCallOrder[n - 1]);
    expect(secondCancel).toBeLessThan(schedule.mock.invocationCallOrder[n]);
  });
});

describe('openNotificationSettings', () => {
  it('opens the phone’s settings for the app and swallows a refusal', async () => {
    await openNotificationSettings();
    expect(rn.Linking.openSettings).toHaveBeenCalledTimes(1);
    rn.Linking.openSettings.mockRejectedValueOnce(new Error('cannot open settings'));
    await expect(openNotificationSettings()).resolves.toBeUndefined();
  });
});
