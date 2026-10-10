import { beforeEach, describe, expect, it, vi } from 'vitest';

import { accessOf, isLocked, PRODUCT_ID, simulateTrialEnded, TRIAL_MS, useAccess } from '../access';

// an in-memory AsyncStorage so the persisted store can be imported under node (vi.mock is hoisted above the imports)
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

const T = Date.UTC(2026, 9, 7, 12);
const bought = { productId: PRODUCT_ID, transactionId: 'tx-1', purchasedAt: T, store: 'apple' };

describe('useAccess', () => {
  beforeEach(() => useAccess.setState({ trialStartedAt: 0, lastSeenAt: 0, purchase: null }));

  it('starts the week on the first touch and only then', () => {
    useAccess.getState().touch(T);
    useAccess.getState().touch(T + 1000);
    expect(useAccess.getState().trialStartedAt).toBe(T);
    expect(accessOf(T + 1000)).toMatchObject({ kind: 'trial', endsAt: T + TRIAL_MS, daysLeft: 7 });
  });

  it('only moves the last seen time forward', () => {
    useAccess.getState().touch(T + 5000);
    useAccess.getState().touch(T);
    expect(useAccess.getState().lastSeenAt).toBe(T + 5000);
  });

  it('locks once the week is over and unlocks with a purchase', () => {
    useAccess.getState().touch(T);
    expect(isLocked(T + TRIAL_MS - 1)).toBe(false);
    expect(isLocked(T + TRIAL_MS)).toBe(true);
    useAccess.getState().setPurchase(bought);
    expect(isLocked(T + TRIAL_MS)).toBe(false);
    expect(accessOf(T + TRIAL_MS)).toEqual({ kind: 'paid', since: T });
  });

  it('refuses a purchase record of another product', () => {
    useAccess.getState().setPurchase({ ...bought, productId: 'other' });
    expect(useAccess.getState().purchase).toBeNull();
  });

  it('can end the week early for development', () => {
    useAccess.getState().touch(T);
    simulateTrialEnded(T + 1000);
    expect(isLocked(T + 1000)).toBe(true);
  });
});
