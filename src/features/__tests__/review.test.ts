import { describe, expect, it } from 'vitest';

import { engagementOf, REVIEW_RULES, shouldAskForReview } from '../reviewRules';

const DAY = 86_400_000;
const used = { '2026-10-01': 2, '2026-10-02': 2, '2026-10-04': 1 };

describe('review prompt rules', () => {
  it('sums active days and completions', () => {
    expect(engagementOf(used)).toEqual({ activeDays: 3, completions: 5 });
    expect(engagementOf({})).toEqual({ activeDays: 0, completions: 0 });
  });
  it('asks after three active days and five completions with the model ready', () => {
    expect(shouldAskForReview(engagementOf(used), { askedAt: null, asks: 0 }, true)).toBe(true);
    expect(shouldAskForReview(engagementOf(used), { askedAt: null, asks: 0 }, false)).toBe(false);
    expect(shouldAskForReview({ activeDays: 2, completions: 9 }, { askedAt: null, asks: 0 }, true)).toBe(false);
    expect(shouldAskForReview({ activeDays: 3, completions: 4 }, { askedAt: null, asks: 0 }, true)).toBe(false);
  });
  it('waits four months between asks and stops after three', () => {
    const now = Date.now();
    expect(shouldAskForReview(engagementOf(used), { askedAt: now - 10 * DAY, asks: 1 }, true, now)).toBe(false);
    expect(shouldAskForReview(engagementOf(used), { askedAt: now - 121 * DAY, asks: 1 }, true, now)).toBe(true);
    expect(shouldAskForReview(engagementOf(used), { askedAt: now - 400 * DAY, asks: REVIEW_RULES.maxAsks }, true, now)).toBe(false);
  });
});
