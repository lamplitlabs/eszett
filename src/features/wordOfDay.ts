// The word of the day: one noun with an example from the learner's level, picked by the date, so the home screen
// and the morning notification (src/features/notify.ts) show the same word without storing anything.
import { nounsUpTo, type LexNoun } from '@/harness/lexicon';
import type { Level } from '@/harness/levels';
import { coreLexicon } from '@/model/runtime';
import { dayKey } from '@/state/storage';

/** The noun for the (local) day `at` falls in, or null when the level has no nouns with an example. */
export function wordOfDay(level: Level, at = Date.now()): LexNoun | null {
  const pool = nounsUpTo(coreLexicon, level).filter((n) => n.example);
  if (pool.length === 0) return null;
  const seed = Number(dayKey(at).replace(/-/g, ''));
  return pool[seed % pool.length];
}
