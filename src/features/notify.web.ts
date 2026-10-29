// The web build: the browser gets no reminders from Eszett (they are planned on the phone, see notify.ts). Same
// exports as notify.ts; the permission is 'unavailable' and nothing is scheduled or routed.
import type { NotifyPrefs } from './notifyStore';

export type NotifyPermission = 'undetermined' | 'granted' | 'denied' | 'unavailable';
export const CHANNEL_REMINDERS = 'reminders';
export const CHANNEL_WORDS = 'words';

export async function notificationPermission(): Promise<NotifyPermission> {
  return 'unavailable';
}

export function useNotifyPermission(): NotifyPermission {
  return 'unavailable';
}

export async function enableNotifications(_patch: Partial<Pick<NotifyPrefs, 'reminder' | 'wordOfDay'>> = { reminder: true, wordOfDay: true }): Promise<NotifyPermission> {
  return 'unavailable';
}

export async function syncNotifications(_now = Date.now()): Promise<void> {
  return undefined;
}

export async function openNotificationSettings(): Promise<void> {
  return undefined;
}

export async function sendTestNotification(): Promise<boolean> {
  return false;
}

export function useNotificationBind(_hydrated: boolean): void {
  return undefined;
}
