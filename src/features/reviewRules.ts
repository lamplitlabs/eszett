// Review-screen rules. Pure: tested in node; the UI (src/app/review.tsx) and src/features/review.ts
// do the platform calls.
//
// When the app may ask for a store review:

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

// Exporting "My words" as CSV: a learner can share the list out of the app (mail, files, a
// spreadsheet) without losing the Leitner box each word sits in. One row per word:
// word, translation, box — the word as shown on the card front, its meaning in the learner's
// language, and the box number the review screen prints.

export const CSV_HEADER = 'word,translation,box';

/** A field per RFC 4180: quote when it holds a comma, quote or line break; quotes inside double. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** The saved words as a CSV document, ready to share. Empty deck: header only. */
export function formatDeckWordsCsv(words: Pick<import('@/state/deck').DeckWord, 'german' | 'meaning' | 'box'>[]): string {
  return [CSV_HEADER, ...words.map((w) => [csvField(w.german), csvField(w.meaning), String(w.box)].join(','))].join('\n');
}
