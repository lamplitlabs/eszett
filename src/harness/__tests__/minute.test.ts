import { describe, expect, it } from 'vitest';

import { LEVELS } from '../levels';
import { MIN_WORDS, MINUTE_PROMPTS, MINUTE_SECONDS, minutePart, minutePromptsFor, minuteResult, minuteSheet, minuteStats, promptOfDay, variety } from '../minute';

describe('one-minute prompts', () => {
  it('has ten prompts a level with three cue points each, ids unique and level-prefixed', () => {
    for (const level of LEVELS) {
      const pool = minutePromptsFor(level);
      expect(pool.length, level).toBe(10);
      for (const p of pool) {
        expect(p.id.startsWith(`${level.toLowerCase()}-`)).toBe(true);
        expect(p.points_de).toHaveLength(3);
        expect(p.prompt_de.length).toBeGreaterThan(8);
        expect(/[.?!]$/.test(p.prompt_de), p.id).toBe(true);
      }
    }
    expect(new Set(MINUTE_PROMPTS.map((p) => p.id)).size).toBe(MINUTE_PROMPTS.length);
  });

  it('rotates by day and skips prompts already done', () => {
    const pool = minutePromptsFor('B1');
    expect(promptOfDay('B1', [], 0)).toBe(pool[0]);
    expect(promptOfDay('B1', [], 3)).toBe(pool[3]);
    expect(promptOfDay('B1', [pool[3].id], 3)).toBe(pool[4]);
    expect(promptOfDay('B1', pool.map((p) => p.id), 3)).toBe(pool[3]);
    expect(promptOfDay('B1', [], 13)).toBe(pool[3]);
  });
});

describe('what the app measures', () => {
  it('counts words, different words and fillers, and the pace', () => {
    const s = minuteStats('Ähm, ich bin, äh, gestern ins Kino gegangen. Der Film war gut, der Film war lang.', 30);
    expect(s.fillers).toBe(2);
    expect(s.words).toBe(14);
    expect(s.distinct).toBe(11);
    expect(s.wpm).toBe(28);
    expect(s.longestRun).toBe(8);
    expect(variety(s)).toBeCloseTo(11 / 14);
  });

  it('is safe on an empty transcript', () => {
    const s = minuteStats('', 60);
    expect(s).toMatchObject({ words: 0, distinct: 0, fillers: 0, wpm: 0, longestRun: 0 });
    expect(variety(s)).toBe(0);
  });

  it('rates through the exam grid: fluency by code, points only with a rating', () => {
    const part = minutePart('A2');
    expect(part.speakSeconds).toBe(MINUTE_SECONDS);
    expect(part.minWords).toBe(MIN_WORDS.A2);
    const sheet = minuteSheet(MINUTE_PROMPTS[0]);
    expect(sheet.heading).toBe(MINUTE_PROMPTS[0].prompt_de);
    expect(sheet.points).toHaveLength(3);
    const said = Array.from({ length: 70 }, (_, i) => (i % 7 === 6 ? 'gegangen.' : 'ich bin gestern mit meiner Freundin ins Kino'.split(' ')[i % 7])).join(' ');
    const unrated = minuteResult('A2', said, 60, null);
    expect(unrated.percent).toBeNull();
    expect(unrated.fluency).toBeGreaterThanOrEqual(3);
    const rated = minuteResult('A2', said, 60, { scores: { fulfilment: 3, coherence: 3, vocabulary: 2, structures: 2 }, comment: '', tip: '', better: '' });
    expect(rated.percent).toBe(Math.round(((10 + rated.fluency) / 20) * 100));
    const short = minuteResult('A2', 'Ich bin gestern ins Kino gegangen.', 60, null);
    expect(short.fluency).toBeLessThanOrEqual(1);
  });
});
