import { describe, expect, it } from 'vitest';

import { DAY_MS, evaluateAccess, isPurchaseRecord, PRODUCT_ID, purchaseRecordOf, TRIAL_MS, type AccessRecord } from '../accessRules';

const T = Date.UTC(2026, 9, 7, 12);
const fresh = (over: Partial<AccessRecord> = {}): AccessRecord => ({ trialStartedAt: T, lastSeenAt: T, purchase: null, ...over });
const bought = { productId: PRODUCT_ID, transactionId: 'tx-1', purchasedAt: T + DAY_MS, store: 'apple' };

describe('evaluateAccess', () => {
  it('gives the full week from the first start', () => {
    expect(evaluateAccess(fresh(), T)).toEqual({ kind: 'trial', endsAt: T + TRIAL_MS, daysLeft: 7 });
    expect(evaluateAccess(fresh(), T + 3 * DAY_MS + 1)).toMatchObject({ kind: 'trial', daysLeft: 4 });
    // the last day counts as one day, never zero
    expect(evaluateAccess(fresh(), T + TRIAL_MS - 1)).toMatchObject({ kind: 'trial', daysLeft: 1 });
  });

  it('ends the moment the week is over', () => {
    expect(evaluateAccess(fresh(), T + TRIAL_MS)).toEqual({ kind: 'ended', endedAt: T + TRIAL_MS });
    expect(evaluateAccess(fresh(), T + 40 * DAY_MS)).toMatchObject({ kind: 'ended' });
  });

  it('treats a record whose week has not started as a full week', () => {
    expect(evaluateAccess({ trialStartedAt: 0, lastSeenAt: 0, purchase: null }, T)).toMatchObject({ kind: 'trial', daysLeft: 7 });
  });

  it('does not give the week back to a clock set into the past', () => {
    const seen = fresh({ lastSeenAt: T + TRIAL_MS + DAY_MS });
    expect(evaluateAccess(seen, T + DAY_MS)).toMatchObject({ kind: 'ended' });
    const early = fresh({ lastSeenAt: T + 6 * DAY_MS });
    expect(evaluateAccess(early, T)).toMatchObject({ kind: 'trial', daysLeft: 1 });
  });

  it('is paid as soon as there is a purchase, whatever the clock says', () => {
    expect(evaluateAccess(fresh({ purchase: bought }), T + 400 * DAY_MS)).toEqual({ kind: 'paid', since: T + DAY_MS });
  });
});

describe('purchaseRecordOf', () => {
  const p = { id: 'tx-9', productId: PRODUCT_ID, purchaseState: 'purchased' as const, transactionDate: T, storeId: 'play' };

  it('keeps a complete purchase of our product', () => {
    expect(purchaseRecordOf(p)).toEqual({ productId: PRODUCT_ID, transactionId: 'tx-9', purchasedAt: T, store: 'play' });
  });

  it('refuses another product, a pending purchase and one without an id', () => {
    expect(purchaseRecordOf({ ...p, productId: 'something_else' })).toBeNull();
    expect(purchaseRecordOf({ ...p, purchaseState: 'pending' })).toBeNull();
    expect(purchaseRecordOf({ ...p, purchaseState: 'unknown' })).toBeNull();
    expect(purchaseRecordOf({ ...p, id: '' })).toBeNull();
  });

  it('falls back to now when the store gives no date', () => {
    const before = Date.now();
    const rec = purchaseRecordOf({ ...p, transactionDate: 0 });
    expect(rec?.purchasedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('isPurchaseRecord', () => {
  it('accepts the saved shape and nothing else', () => {
    expect(isPurchaseRecord(bought)).toBe(true);
    expect(isPurchaseRecord(null)).toBe(false);
    expect(isPurchaseRecord({ ...bought, productId: 'other' })).toBe(false);
    expect(isPurchaseRecord({ ...bought, transactionId: '' })).toBe(false);
    expect(isPurchaseRecord({ ...bought, purchasedAt: '1' })).toBe(false);
  });
});
