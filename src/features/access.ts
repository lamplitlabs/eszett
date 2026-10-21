// The record behind the week-long trial and the one-time purchase (rules in accessRules.ts): when the app was first
// opened, the latest clock reading, and the purchase once there is one. Persisted like the other stores; nothing
// here touches Expo so the tests can run it in node. src/features/accessBind.ts connects it to the model and the
// store, src/features/purchases.ts fills in the purchase.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import { storage } from '@/state/storage';

import { evaluateAccess, isPurchaseRecord, TRIAL_MS, type Access, type AccessRecord, type PurchaseRecord } from './accessRules';

export { DAY_MS, evaluateAccess, PRODUCT_ID, TRIAL_DAYS, TRIAL_MS, type Access, type AccessRecord, type PurchaseRecord } from './accessRules';

interface AccessState extends AccessRecord {
  /** Notes the time: starts the week on the first call, moves `lastSeenAt` forward (never back). */
  touch: (now?: number) => void;
  setPurchase: (purchase: PurchaseRecord | null) => void;
  /** Development only: moves the week's start so the ended state can be seen without waiting (see unlock.tsx). */
  setTrialStartedAt: (trialStartedAt: number) => void;
}

export const useAccess = create<AccessState>()(
  persist(
    (set, get) => ({
      trialStartedAt: 0,
      lastSeenAt: 0,
      purchase: null,
      touch: (now = Date.now()) => {
        const s = get();
        const patch: Partial<AccessRecord> = {};
        if (s.trialStartedAt <= 0) patch.trialStartedAt = now;
        if (now > s.lastSeenAt) patch.lastSeenAt = now;
        if (Object.keys(patch).length) set(patch);
      },
      setPurchase: (purchase) => set({ purchase: purchase && isPurchaseRecord(purchase) ? purchase : null }),
      setTrialStartedAt: (trialStartedAt) => set({ trialStartedAt }),
    }),
    {
      name: 'eszett.access',
      storage,
      version: 1,
      partialize: ({ trialStartedAt, lastSeenAt, purchase }) => ({ trialStartedAt, lastSeenAt, purchase }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AccessRecord>;
        return {
          ...current,
          trialStartedAt: typeof p.trialStartedAt === 'number' ? p.trialStartedAt : 0,
          lastSeenAt: typeof p.lastSeenAt === 'number' ? p.lastSeenAt : 0,
          purchase: isPurchaseRecord(p.purchase) ? p.purchase : null,
        };
      },
    },
  ),
);

/** The access right now (or at `now`). */
export const accessOf = (now = Date.now()): Access => evaluateAccess(useAccess.getState(), now);

/**
 * Hook: the access as of the latest clock reading the store has (accessBind touches it at every start, return
 * to the front and at the end of the week), so a render needs no clock of its own.
 */
export const useAccessView = (): Access => useAccess(useShallow((s) => evaluateAccess(s, s.lastSeenAt)));

/** True while the tutor must stay locked: the week is over and nothing has been bought. */
export const isLocked = (now = Date.now()) => accessOf(now).kind === 'ended';

/** Development only: the week ended a moment ago. */
export const simulateTrialEnded = (now = Date.now()) => useAccess.getState().setTrialStartedAt(now - TRIAL_MS - 1000);
