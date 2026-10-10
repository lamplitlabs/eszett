// When the app may ask for a store review. Pure: tested in node; src/features/review.ts makes the call.

export const REVIEW_RULES = {
  /** Days with at least one exercise before the first ask. */
  minActiveDays: 3,
  /** Exercises, checks and answers in all. */
  minCompletions: 5,
  /** Between two asks. */
  minGapMs: 120 * 86_400_000,
  maxAsks: 3,
} as const;

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.lamplitlabs.eszett';

export interface Engagement {
  activeDays: number;
  completions: number;
}

/** What the progress store says about use so far. */
export function engagementOf(days: Record<string, number>): Engagement {
  const counts = Object.values(days);
  return { activeDays: counts.filter((n) => n > 0).length, completions: counts.reduce((a, b) => a + b, 0) };
}

/** True when the app may ask now. */
export function shouldAskForReview(e: Engagement, state: { askedAt: number | null; asks: number }, modelReady: boolean, now = Date.now()): boolean {
  if (!modelReady) return false;
  if (e.activeDays < REVIEW_RULES.minActiveDays || e.completions < REVIEW_RULES.minCompletions) return false;
  if (state.asks >= REVIEW_RULES.maxAsks) return false;
  if (state.askedAt !== null && now - state.askedAt < REVIEW_RULES.minGapMs) return false;
  return true;
}
