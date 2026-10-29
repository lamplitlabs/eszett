import { describe, expect, it } from 'vitest';

import { pronunciationTips } from '../pronunciation';

const rules = (words: string[], max?: number) => pronunciationTips(words, max).map((t) => t.rule);

describe('pronunciation tips', () => {
  it('points at the German sounds in a missed word, rarer sounds first', () => {
    expect(rules(['Tür'])).toEqual(['ue', 'r']);
    expect(rules(['schön'])).toEqual(['oe', 'sch']);
    expect(rules(['Buch'])).toEqual(['ach']);
    expect(rules(['ich'])).toEqual(['ich']);
    expect(rules(['Milch'])).toEqual(['ich']);
    expect(rules(['Mädchen'])).toEqual(['ich', 'ae']);
    expect(rules(['zwanzig'])).toEqual(['ig', 'z']);
    expect(rules(['Wasser'])).toEqual(['w', 'r']);
    expect(rules(['vier'])).toEqual(['ie', 'v']);
    expect(rules(['Straße'])).toEqual(['stsp', 'sz']);
    expect(rules(['heute'])).toEqual(['eu']);
    expect(rules(['sehr'])).toEqual(['h', 's']);
    expect(rules(['Bahn'])).toEqual(['h']);
    expect(rules(['Tag'])).toEqual(['final']);
    expect(rules(['Krankenschwester'])).toContain('long');
  });

  it('ranks a sound shared by several words first and keeps the learner\'s words as examples', () => {
    const tips = pronunciationTips(['Tür', 'fünf', 'Buch', 'über.']);
    expect(tips[0].rule).toBe('ue');
    expect(tips[0].words).toEqual(['Tür', 'fünf', 'über']);
    expect(tips.map((t) => t.rule)).toContain('ach');
  });

  it('returns at most the asked number, ignores numbers and punctuation, and nothing for nothing', () => {
    expect(pronunciationTips(['Tür', 'schön', 'Buch', 'Zeit', 'Wasser'], 2)).toHaveLength(2);
    expect(pronunciationTips(['7', '„', ''])).toEqual([]);
    expect(pronunciationTips([])).toEqual([]);
  });
});
