// Who may use the tutor: everyone for the first week after the app is first opened, then only a learner who has
// bought Eszett once (a one-time purchase, no subscription). The drills, rule cards, word lookups and the
// pass-and-play games stay free; the gate is on the model (src/model/runtime.ts status 'locked'). Pure: tested in
// node; src/features/access.ts keeps the record, src/features/purchases.ts talks to the store.

export const TRIAL_DAYS = 7;
export const DAY_MS = 86_400_000;
export const TRIAL_MS = TRIAL_DAYS * DAY_MS;

/** The one product in both stores: a non-consumable (App Store) / one-time product (Google Play). */
export const PRODUCT_ID = 'eszett_full_access';

/** What the app keeps of a purchase, so it opens unlocked without asking the store first. */
export interface PurchaseRecord {
  productId: string;
  /** The store's transaction id. */
  transactionId: string;
  /** When the store says it was bought (ms). */
  purchasedAt: number;
  /** 'apple', 'play', … (the store's id). */
  store: string;
}

export interface AccessRecord {
  /** When the app was first opened on this phone (ms); 0 until the first start sets it. */
  trialStartedAt: number;
  /** The latest clock reading the app has seen: a clock set back past it does not stretch the week. */
  lastSeenAt: number;
  purchase: PurchaseRecord | null;
}

export type Access =
  | { kind: 'paid'; since: number }
  | { kind: 'trial'; endsAt: number; daysLeft: number }
  | { kind: 'ended'; endedAt: number };

/** The access for `record` at `now`; a record whose trial has not been started yet counts as a full week. */
export function evaluateAccess(record: AccessRecord, now: number): Access {
  if (record.purchase) return { kind: 'paid', since: record.purchase.purchasedAt };
  // the clock can only move forward: a phone set back in time does not get its week again
  const clock = Math.max(now, record.lastSeenAt);
  const startedAt = record.trialStartedAt > 0 ? record.trialStartedAt : clock;
  const endsAt = startedAt + TRIAL_MS;
  if (clock < endsAt) return { kind: 'trial', endsAt, daysLeft: Math.max(1, Math.ceil((endsAt - clock) / DAY_MS)) };
  return { kind: 'ended', endedAt: endsAt };
}

/** The shape of a store purchase this module reads (a subset of expo-iap's Purchase). */
export interface StorePurchase {
  id: string;
  productId: string;
  purchaseState: 'pending' | 'purchased' | 'unknown';
  transactionDate: number;
  storeId: string;
}

/** The record for a store purchase of our product that has gone through; null for anything else. */
export function purchaseRecordOf(p: StorePurchase): PurchaseRecord | null {
  if (p.productId !== PRODUCT_ID || p.purchaseState !== 'purchased' || typeof p.id !== 'string' || !p.id) return null;
  const purchasedAt = typeof p.transactionDate === 'number' && Number.isFinite(p.transactionDate) && p.transactionDate > 0 ? p.transactionDate : Date.now();
  return { productId: p.productId, transactionId: p.id, purchasedAt, store: typeof p.storeId === 'string' ? p.storeId : 'unknown' };
}

/** True for a saved record with the fields above (a store's persisted state may be older or hand-edited). */
export function isPurchaseRecord(x: unknown): x is PurchaseRecord {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return r.productId === PRODUCT_ID && typeof r.transactionId === 'string' && r.transactionId.length > 0 && typeof r.purchasedAt === 'number';
}
