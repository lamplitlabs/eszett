// Reminders on the phone: the practice nudge and the word of the day as local notifications (expo-notifications),
// scheduled by the app itself — no push service, nothing leaves the device. notifyRules.ts decides what and when;
// this module holds the permission, the Android channels, the sync that cancels and reschedules the plan, and
// the root-layout binding (resync on changes, taps → route). notify.web.ts answers for the web build.
import * as Notifications from 'expo-notifications';
import { router, useNavigationContainerRef } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { GENUS_ARTICLE } from '@/harness/lexicon';
import { getLanguage, t } from '@/i18n';
import { wordMeaning } from '@/i18n/content';
import { useDeck } from '@/state/deck';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';

import { notificationRoute, planNotifications, type PlanInput } from './notifyRules';
import { prefsOf, useNotify, type NotifyPrefs } from './notifyStore';
import { wordOfDay } from './wordOfDay';

export type NotifyPermission = 'undetermined' | 'granted' | 'denied' | 'unavailable';
export const CHANNEL_REMINDERS = 'reminders';
export const CHANNEL_WORDS = 'words';

/** Store changes come in bursts (an exercise records several items): one resync a moment after the last. */
const SYNC_DEBOUNCE_MS = 1500;

// the app is open when a notification arrives: nothing to show, the screen itself is the reminder
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
});

/** iOS answers in its own grades (provisional and ephemeral count as granted); Android with a plain yes/no. */
function permissionOf(s: Notifications.NotificationPermissionsStatus): NotifyPermission {
  if (s.ios) {
    const { AUTHORIZED, PROVISIONAL, EPHEMERAL, DENIED } = Notifications.IosAuthorizationStatus;
    const { status } = s.ios;
    if (status === AUTHORIZED || status === PROVISIONAL || status === EPHEMERAL) return 'granted';
    return status === DENIED ? 'denied' : 'undetermined';
  }
  if (s.granted) return 'granted';
  return s.canAskAgain ? 'undetermined' : 'denied';
}

// the last answer, so a screen that mounts later starts from it instead of flashing the default; the watchers
// are the mounted useNotifyPermission hooks, told whenever any call learns a new answer
let lastPermission: NotifyPermission = 'undetermined';
const permissionWatchers = new Set<(p: NotifyPermission) => void>();

function remember(permission: NotifyPermission): NotifyPermission {
  if (permission !== lastPermission) {
    lastPermission = permission;
    permissionWatchers.forEach((watch) => watch(permission));
  }
  return permission;
}

/** Current permission; 'unavailable' on web and on devices where the module is missing (never throws). */
export async function notificationPermission(): Promise<NotifyPermission> {
  try {
    return remember(permissionOf(await Notifications.getPermissionsAsync()));
  } catch {
    return remember('unavailable');
  }
}

/**
 * Hook: the permission, refreshed on mount, when the app returns to the foreground (the learner may change it in
 * the phone's settings) and whenever enableNotifications or a sync learns a new answer.
 */
export function useNotifyPermission(): NotifyPermission {
  const [permission, setPermission] = useState(() => lastPermission);
  useEffect(() => {
    permissionWatchers.add(setPermission);
    void notificationPermission();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void notificationPermission();
    });
    return () => {
      permissionWatchers.delete(setPermission);
      sub.remove();
    };
  }, []);
  return permission;
}

/** Android groups notifications by channel; names follow the app language, so they are set again on every sync. */
async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_REMINDERS, { name: t('notify.channelReminders'), importance: Notifications.AndroidImportance.DEFAULT });
  await Notifications.setNotificationChannelAsync(CHANNEL_WORDS, { name: t('notify.channelWords'), importance: Notifications.AndroidImportance.LOW });
}

/**
 * Turns the given prefs on: creates the Android channels (before the Android 13 prompt), asks for permission if
 * undetermined, saves the prefs when granted (also records promptAnsweredAt), syncs. Resolves the permission.
 */
export async function enableNotifications(patch: Partial<Pick<NotifyPrefs, 'reminder' | 'wordOfDay'>> = { reminder: true, wordOfDay: true }): Promise<NotifyPermission> {
  let permission: NotifyPermission;
  try {
    // Android 13 shows its prompt only once a channel exists
    await ensureChannels();
    permission = permissionOf(await Notifications.getPermissionsAsync());
    if (permission === 'undetermined') {
      permission = permissionOf(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
    }
  } catch {
    permission = 'unavailable';
  }
  remember(permission);
  const promptAnsweredAt = Date.now();
  useNotify.getState().set(permission === 'granted' ? { ...patch, promptAnsweredAt } : { promptAnsweredAt });
  await syncNotifications();
  return permission;
}

/** `YYYY-MM-DD` as local noon, well inside the day whatever the clock change. */
function noonOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

async function sync(now: number): Promise<void> {
  // before hydration the prefs are the defaults (everything off); the bind hook syncs again once they are in
  if (!useNotify.persist.hasHydrated()) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const prefs = prefsOf(useNotify.getState());
    if (!prefs.reminder && !prefs.wordOfDay) return;
    if ((await notificationPermission()) !== 'granted') return;
    await ensureChannels();
    const { level } = useSettings.getState();
    const lang = getLanguage();
    const input: PlanInput = {
      prefs,
      days: useProgress.getState().days,
      dueTimes: Object.values(useDeck.getState().words).map((w) => w.due),
      wordFor: (day) => {
        const w = wordOfDay(level, noonOf(day));
        return w ? { lemma: w.lemma, article: GENUS_ARTICLE[w.genus], meaning: wordMeaning(w.lemma, w.meaning ?? '', lang), example: w.example } : null;
      },
      lang,
    };
    for (const n of planNotifications(input, now)) {
      const word = n.id.startsWith('word:');
      await Notifications.scheduleNotificationAsync({
        identifier: n.id,
        content: { title: n.title, body: n.body, data: { url: n.url }, sound: word ? false : 'default' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: word ? CHANNEL_WORDS : CHANNEL_REMINDERS },
      });
    }
  } catch {
    // no notification module in this build, or the system refused: the learner simply gets no reminder
  }
}

let chain: Promise<void> = Promise.resolve();

/** Cancels every pending notification and schedules the current plan (no-op → cancel only when nothing applies). Serialised; never throws. */
export async function syncNotifications(now = Date.now()): Promise<void> {
  chain = chain.then(() => sync(now)).catch(() => undefined);
  return chain;
}

/** Opens the phone's notification settings for Eszett (Linking.openSettings()). */
export async function openNotificationSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // no settings screen to open: nothing to do
  }
}

/** Root-layout hook: handler, resync on changes and on background, taps → router. */
export function useNotificationBind(hydrated: boolean): void {
  const navigation = useNavigationContainerRef();
  // the route of a tapped notification, kept until the app can show it
  const pendingUrl = useRef<string | null>(null);

  // the plan follows the stores (debounced), and is made fresh whenever the app leaves or comes back
  useEffect(() => {
    if (!hydrated) return;
    void syncNotifications();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const later = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void syncNotifications();
      }, SYNC_DEBOUNCE_MS);
    };
    const unsubs = [
      useProgress.subscribe((s, prev) => {
        if (s.days !== prev.days) later();
      }),
      useDeck.subscribe((s, prev) => {
        if (s.words !== prev.words) later();
      }),
      useSettings.subscribe((s, prev) => {
        if (s.level !== prev.level || s.language !== prev.language) later();
      }),
      useNotify.subscribe((s, prev) => {
        if (s.reminder !== prev.reminder || s.hour !== prev.hour || s.wordOfDay !== prev.wordOfDay) later();
      }),
    ];
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'background' && next !== 'active') return;
      if (timer) clearTimeout(timer);
      timer = null;
      void syncNotifications();
    });
    return () => {
      unsubs.forEach((u) => u());
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [hydrated]);

  // taps: the one that may have opened the app, then any while it runs; the route waits for the stores, the
  // onboarding and the navigator
  useEffect(() => {
    const open = () => {
      const url = pendingUrl.current;
      if (!url || !hydrated || !useSettings.getState().onboarded || !navigation.isReady()) return;
      pendingUrl.current = null;
      router.push(url as never);
    };
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const url = notificationRoute(response.notification.request.content.data);
      Notifications.clearLastNotificationResponse();
      if (!url) return;
      pendingUrl.current = url;
      open();
    };
    let sub: { remove: () => void } | null = null;
    try {
      handle(Notifications.getLastNotificationResponse());
      sub = Notifications.addNotificationResponseReceivedListener(handle);
    } catch {
      // no notification module in this build: nothing to route
    }
    const offReady = navigation.addListener('ready', open);
    const unsub = useSettings.subscribe((s, prev) => {
      if (s.onboarded !== prev.onboarded) open();
    });
    open();
    return () => {
      sub?.remove();
      offReady();
      unsub();
    };
  }, [hydrated, navigation]);
}
