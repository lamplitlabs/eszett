import { describe, expect, it } from 'vitest';

import lexiconCore from '../../data/lexicon-core.json';
import { checkDrill, makeRng } from '../drills';
import { cefrOf } from '../levels';
import { LexiconIndex, type LexiconData } from '../lexicon';
import { buildPlacement, PASS_MARK, PLACEMENT_LEVELS, placementOutcome, ROUND_SIZE } from '../placement';

const lex = new LexiconIndex(lexiconCore as unknown as LexiconData);

describe('the placement test', () => {
  it('builds four items per level from that level\'s own words, each with a checkable answer', () => {
    const rounds = buildPlacement(lex, makeRng(7));
    expect(rounds.map((r) => r.level)).toEqual(PLACEMENT_LEVELS);
    for (const r of rounds) {
      expect(r.drills, r.level).toHaveLength(ROUND_SIZE);
      expect(r.drills.map((d) => d.category)).toEqual(['meaning', 'meaning', 'article', 'verbs']);
      for (const d of r.drills) {
        if (d.noun) expect(cefrOf(d.noun.level), `${r.level} ${d.noun.lemma}`).toBe(r.level);
        expect(checkDrill(d, d.accept[0]).ok, `${r.level} ${d.cue}`).toBe(true);
        if (d.mode === 'choice') expect(d.options?.length).toBeGreaterThanOrEqual(3);
      }
    }
    // the same seed gives the same test; another seed another one
    expect(buildPlacement(lex, makeRng(7)).map((r) => r.drills.map((d) => d.cue))).toEqual(rounds.map((r) => r.drills.map((d) => d.cue)));
    expect(buildPlacement(lex, makeRng(8)).map((r) => r.drills.map((d) => d.cue))).not.toEqual(rounds.map((r) => r.drills.map((d) => d.cue)));
  });

  it('suggests the last level passed and stops at the first level that is too hard', () => {
    expect(PASS_MARK).toBe(3);
    expect(placementOutcome([])).toEqual({ level: 'A1', stoppedAt: null });
    expect(placementOutcome([{ level: 'A1', correct: 2 }])).toEqual({ level: 'A1', stoppedAt: 'A1' });
    expect(placementOutcome([{ level: 'A1', correct: 4 }, { level: 'A2', correct: 3 }, { level: 'B1', correct: 1 }])).toEqual({ level: 'A2', stoppedAt: 'B1' });
    expect(placementOutcome(PLACEMENT_LEVELS.map((level) => ({ level, correct: 4 })))).toEqual({ level: 'C1', stoppedAt: null });
  });
});
