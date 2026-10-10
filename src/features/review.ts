// Asking for a store review, once the app has earned it: after a few days of real use, with the model ready,
// through the platform's own in-app dialog (expo-store-review), which Google Play and the App Store throttle
// themselves. Never more than once in four months, three times in all. The decision is a pure function so the
// thresholds are tested in node; the store call lives in `maybeAskForReview`.
import * as StoreReview from 'expo-store-review';
import { Linking, Platform } from 'react-native';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { isReady } from '@/model/runtime';
import { useProgress } from '@/state/progress';
import { storage } from '@/state/storage';

import { engagementOf, PLAY_STORE_URL, shouldAskForReview } from './reviewRules';

export { PLAY_STORE_URL, REVIEW_RULES, engagementOf, shouldAskForReview, type Engagement } from './reviewRules';

export interface ReviewState {
  askedAt: number | null;
  asks: number;
  set: (patch: Partial<Pick<ReviewState, 'askedAt' | 'asks'>>) => void;
}

export const useReview = create<ReviewState>()(
  persist((set) => ({ askedAt: null, asks: 0, set: (patch) => set(patch) }), {
    name: 'eszett.review',
    storage,
    version: 1,
    partialize: ({ askedAt, asks }) => ({ askedAt, asks }),
  }),
);

let pending = false;

/** Asks through the store's dialog when the rules allow it; resolves true when the dialog was requested. */
export async function maybeAskForReview(now = Date.now()): Promise<boolean> {
  if (pending || Platform.OS === 'web') return false;
  const review = useReview.getState();
  if (!shouldAskForReview(engagementOf(useProgress.getState().days), review, isReady(), now)) return false;
  pending = true;
  try {
    if (!(await StoreReview.isAvailableAsync())) return false;
    // counted before the call: the platform may decide to show nothing, and we must not ask again at once
    review.set({ askedAt: now, asks: review.asks + 1 });
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  } finally {
    pending = false;
  }
}

/** The store page of this build, or null where there is none yet (iOS until the App Store id is in app.json, web). */
export function storePageUrl(): string | null {
  if (Platform.OS === 'web') return null;
  return StoreReview.storeUrl() ?? (Platform.OS === 'android' ? PLAY_STORE_URL : null);
}

/** The store page for "Rate Eszett" in settings (the in-app dialog cannot be opened on demand). */
export async function openStorePage(): Promise<void> {
  const url = storePageUrl();
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    // no store app: nothing to do
  }
}
