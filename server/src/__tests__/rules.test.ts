import { describe, expect, it } from 'vitest';

import { DAY_MS, decideDownload, extendUpdates, freshEntitlement, grantFull, isCodeShape, makeCode, MONTH_MS, normalizeCode, recordDownload, summarize } from '../rules';

const T0 = Date.UTC(2026, 9, 30);
const V27 = T0 - 2 * DAY_MS;
const V28 = T0 + 60 * DAY_MS;
const V30 = T0 + 400 * DAY_MS;

describe('who may download', () => {
  it('lets every account download once for free, then asks for full access', () => {
    const fresh = freshEntitlement('u1', T0);
    expect(decideDownload(fresh, 'v27', V27)).toEqual({ allowed: true, reason: 'first' });
    const after = recordDownload(fresh, 'v27', T0);
    expect(after.firstDownloadAt).toBe(T0);
    expect(decideDownload(after, 'v28', V28)).toEqual({ allowed: false, reason: 'needs-full' });
  });

  it('lets an account download again what it downloaded before, for good', () => {
    const ent = recordDownload(freshEntitlement('u1', T0), 'v27', T0);
    expect(decideDownload(ent, 'v27', V27)).toEqual({ allowed: true, reason: 'owned' });
    const later = { ...ent, plan: 'full' as const, updatesUntil: T0 + 10 * DAY_MS };
    expect(decideDownload(later, 'v27', V27).allowed).toBe(true);
  });

  it('with full access allows models released within twelve months, then asks for a fresh tutor', () => {
    const ent = recordDownload(grantFull(freshEntitlement('u1', T0), T0, 'store'), 'v27', T0);
    expect(ent.updatesUntil).toBe(T0 + 12 * MONTH_MS);
    expect(decideDownload(ent, 'v28', V28)).toEqual({ allowed: true, reason: 'full' });
    expect(decideDownload(ent, 'v30', V30)).toEqual({ allowed: false, reason: 'needs-fresh' });
    const extended = extendUpdates(ent, T0 + 30 * DAY_MS);
    expect(extended.updatesUntil).toBe(T0 + 24 * MONTH_MS);
    expect(decideDownload(extended, 'v30', V30).allowed).toBe(true);
  });

  it('extends from now when the window has already passed, and a second full grant stacks', () => {
    const ent = grantFull(freshEntitlement('u1', T0), T0, 'code');
    const late = T0 + 20 * MONTH_MS;
    expect(extendUpdates(ent, late).updatesUntil).toBe(late + 12 * MONTH_MS);
    expect(grantFull(ent, T0 + MONTH_MS, 'gift').updatesUntil).toBe(T0 + 24 * MONTH_MS);
    expect(grantFull(ent, T0 + MONTH_MS, 'gift').source).toBe('code');
    expect(extendUpdates(freshEntitlement('u2', T0), T0).plan).toBe('full');
  });

  it('summarises for the app', () => {
    const ent = recordDownload(grantFull(freshEntitlement('u1', T0), T0, 'store'), 'v27', T0);
    const s = summarize(ent, 'v28', V28, T0 + DAY_MS);
    expect(s).toMatchObject({ plan: 'full', firstDownloadUsed: true, downloaded: ['v27'], student: 'v28', canDownload: true, reason: 'full' });
    expect(s.updatesLeftDays).toBe(Math.ceil((12 * MONTH_MS - DAY_MS) / DAY_MS));
  });
});

describe('codes', () => {
  it('makes readable codes and normalises what learners type', () => {
    let i = 0;
    const code = makeCode(() => ((i += 7) % 32) / 32);
    expect(isCodeShape(code)).toBe(true);
    expect(code).not.toMatch(/[01IO]/);
    expect(normalizeCode(' k7rt m3pq ')).toBe('K7RT-M3PQ');
    expect(normalizeCode('K7RT-M3PQ')).toBe('K7RT-M3PQ');
    expect(isCodeShape(normalizeCode('short'))).toBe(false);
    expect(isCodeShape(normalizeCode('too-short'))).toBe(true);
  });
});
