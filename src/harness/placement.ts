// The placement test: four quick items per level, from A1 upwards, until a level is too hard. The items are the
// app's own deterministic drills (two meanings, an article, a verb form) built from the words and verbs of each
// level, so nothing needs the model and the answers are checked by code. The result is a suggestion the learner
// can take or overrule; it is not written to the progress store.

import { drillArticle, drillMeaning, drillVerb, type Drill, type Rng } from './drills';
import type { Level } from './levels';
import { type LexiconIndex, nounsUpTo } from './lexicon';

/** The levels the test can place: the lexicon has no C2 tier, so C2 stays the learner's own choice. */
export const PLACEMENT_LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
export const ROUND_SIZE = 4;
/** Right answers a round needs to count as passed. */
export const PASS_MARK = 3;

export interface PlacementRound {
  level: Level;
  drills: Drill[];
}

// the verb table is ordered by frequency; each level draws from its own band of it (see buildDrillSet)
const VERB_BANDS: Record<Level, [number, number]> = { A1: [0, 40], A2: [40, 80], B1: [80, 130], B2: [130, 164], C1: [130, 164], C2: [130, 164] };

/** One round per level: two meanings, an article and a verb form, from that level's words. */
export function buildPlacement(lex: LexiconIndex, rng: Rng): PlacementRound[] {
  return PLACEMENT_LEVELS.map((level) => {
    const own = rng.shuffle(nounsUpTo(lex, level, level));
    const pool = nounsUpTo(lex, level);
    const drills: Drill[] = [];
    const meaningNouns = own.filter((n) => n.meaning).slice(0, 2);
    for (const noun of meaningNouns) drills.push(drillMeaning(noun, pool, rng));
    const used = new Set(meaningNouns.map((n) => n.lemma));
    const articleNoun = own.find((n) => !used.has(n.lemma));
    if (articleNoun) drills.push(drillArticle(articleNoun, lex));
    const [from, to] = VERB_BANDS[level];
    const verb = rng.shuffle(lex.verbs.slice(from, to))[0];
    if (verb) drills.push(drillVerb(verb, level === 'A1' || level === 'A2' ? 'perfekt' : 'preterite'));
    return { level, drills };
  });
}

export interface PlacementOutcome {
  /** The level to suggest: the last level passed, A1 when none was. */
  level: Level;
  /** The first level that was too hard, or null when every level passed. */
  stoppedAt: Level | null;
}

/**
 * Reads the rounds answered so far, in level order: a round passes with `PASS_MARK` right answers; the first
 * round that fails ends the test, and the level before it is the suggestion.
 */
export function placementOutcome(rounds: { level: Level; correct: number }[]): PlacementOutcome {
  let level: Level = 'A1';
  for (const r of rounds) {
    if (r.correct < PASS_MARK) return { level, stoppedAt: r.level };
    level = r.level;
  }
  return { level, stoppedAt: null };
}
