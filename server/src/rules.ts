// The rules of who may download which tutor model, pure and tested (src/__tests__/rules.test.ts). The business
// model they encode: the first download is free for every account (the free week); "Eszett for good" is one
// purchase that brings every tutor model released within twelve months and the last of them for good; a model
// once downloaded can always be downloaded again (a new phone, a reinstall); a "fresh tutor" purchase extends the
// twelve months; a code from an institution or from the pay-it-forward pool grants the same as the purchase.
// Nothing renews by itself and nothing is taken away: the app and the last model keep working.

export const DAY_MS = 86_400_000;
export const MONTH_MS = 30.4375 * DAY_MS;

export type Plan = 'none' | 'full';
export type Source = 'store' | 'code' | 'gift' | 'manual';

export interface Entitlement {
  userId: string;
  plan: Plan;
  /** When full access was bought or granted (ms); null without. */
  purchasedAt: number | null;
  /** Models released before this instant may be downloaded (ms); null without full access. */
  updatesUntil: number | null;
  /** When the free first download was used (ms); null until then. */
  firstDownloadAt: number | null;
  /** Students this account has downloaded, with the first time (ms): they can be downloaded again at any time. */
  downloaded: Record<string, number>;
  source: Source | null;
  /** Gift codes this account bought for others (pay it forward), by code. */
  gifts: string[];
  updatedAt: number;
}

export const freshEntitlement = (userId: string, now: number): Entitlement => ({
  userId,
  plan: 'none',
  purchasedAt: null,
  updatesUntil: null,
  firstDownloadAt: null,
  downloaded: {},
  source: null,
  gifts: [],
  updatedAt: now,
});

export type DownloadVerdict =
  | { allowed: true; reason: 'first' | 'owned' | 'full' }
  | { allowed: false; reason: 'needs-full' | 'needs-fresh' };

/**
 * May this account download the model of `student`, released at `releasedAt`?
 * - its first download ever is free (the free week needs a tutor);
 * - a model it downloaded before is its own, for good;
 * - with full access, any model released within the updates window.
 * Otherwise full access is missing, or the window has passed (a "fresh tutor" extends it).
 */
export function decideDownload(ent: Entitlement, student: string, releasedAt: number): DownloadVerdict {
  if (ent.downloaded[student]) return { allowed: true, reason: 'owned' };
  if (ent.firstDownloadAt === null) return { allowed: true, reason: 'first' };
  if (ent.plan === 'full' && ent.updatesUntil !== null && releasedAt <= ent.updatesUntil) return { allowed: true, reason: 'full' };
  return { allowed: false, reason: ent.plan === 'full' ? 'needs-fresh' : 'needs-full' };
}

/** Records a download: the first one and the student, so both rules above hold next time. */
export function recordDownload(ent: Entitlement, student: string, now: number): Entitlement {
  return {
    ...ent,
    firstDownloadAt: ent.firstDownloadAt ?? now,
    downloaded: ent.downloaded[student] ? ent.downloaded : { ...ent.downloaded, [student]: now },
    updatedAt: now,
  };
}

/** Full access from a purchase or a code: twelve months of models from now; a second grant extends from where the first ends. */
export function grantFull(ent: Entitlement, now: number, source: Source, months = 12): Entitlement {
  const from = ent.plan === 'full' && ent.updatesUntil !== null && ent.updatesUntil > now ? ent.updatesUntil : now;
  return {
    ...ent,
    plan: 'full',
    purchasedAt: ent.purchasedAt ?? now,
    updatesUntil: from + months * MONTH_MS,
    source: ent.source ?? source,
    updatedAt: now,
  };
}

/** A "fresh tutor" purchase: the updates window grows by `months`, from its end or from now if it has passed. */
export function extendUpdates(ent: Entitlement, now: number, months = 12): Entitlement {
  if (ent.plan !== 'full') return grantFull(ent, now, 'store', months);
  const from = ent.updatesUntil !== null && ent.updatesUntil > now ? ent.updatesUntil : now;
  return { ...ent, updatesUntil: from + months * MONTH_MS, updatedAt: now };
}

/** The products the stores sell, by id, and what each does to an entitlement. */
export const PRODUCTS = {
  /** One purchase: the app for good and twelve months of tutor models. */
  eszett_full_access: 'full',
  /** Twelve more months of tutor models for someone who already has full access. */
  eszett_fresh_tutor: 'fresh',
  /** Full access for someone else: a code goes into the pay-it-forward pool. */
  eszett_gift: 'gift',
} as const;
export type ProductId = keyof typeof PRODUCTS;
export const isProductId = (x: string): x is ProductId => x in PRODUCTS;

/** What the app shows: the entitlement in plain fields, and whether the current model may be downloaded. */
export function summarize(ent: Entitlement, student: string, releasedAt: number, now: number) {
  const verdict = decideDownload(ent, student, releasedAt);
  return {
    plan: ent.plan,
    purchasedAt: ent.purchasedAt,
    updatesUntil: ent.updatesUntil,
    updatesLeftDays: ent.updatesUntil !== null ? Math.max(0, Math.ceil((ent.updatesUntil - now) / DAY_MS)) : 0,
    firstDownloadUsed: ent.firstDownloadAt !== null,
    downloaded: Object.keys(ent.downloaded),
    gifts: ent.gifts.length,
    student,
    canDownload: verdict.allowed,
    reason: verdict.reason,
  };
}

/** A code: eight letters and digits without the ones that look alike, in two groups ("K7RT-M3PQ"). */
export function makeCode(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i += 1) out += alphabet[Math.floor(random() * alphabet.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export const normalizeCode = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})$/, '$1-$2');
export const isCodeShape = (code: string): boolean => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);
