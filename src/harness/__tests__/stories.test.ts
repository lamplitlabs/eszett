import { describe, expect, it } from 'vitest';

import { LEVELS } from '../levels';
import { parseStoryKey, STORIES, storiesFor, storyKey, storyMinutes, storyProgress, storyReading } from '../stories';

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe('the story pack', () => {
  it('ships real texts from A2 to C2 with unique ids, credits and sources', () => {
    expect(STORIES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(STORIES.map((s) => s.id)).size).toBe(STORIES.length);
    for (const s of STORIES) {
      expect(LEVELS).toContain(s.level);
      expect(s.level).not.toBe('A1');
      expect(s.author.length).toBeGreaterThan(3);
      expect(s.year).toBeGreaterThan(1800);
      expect(s.year).toBeLessThan(1930);
      expect(s.edition.length).toBeGreaterThan(8);
      expect(s.source).toMatch(/^https:\/\/de\.wikisource\.org\/wiki\//);
      expect(s.words).toBeGreaterThan(150);
    }
    for (const level of ['A2', 'B1', 'B2', 'C1', 'C2'] as const) expect(STORIES.some((s) => s.level === level), level).toBe(true);
  });

  it('cuts every story into parts of a few minutes, each with three checkable questions and a gloss', () => {
    for (const s of STORIES) {
      expect(s.parts.length).toBeGreaterThan(0);
      for (const p of s.parts) {
        expect(words(p.text)).toBeGreaterThan(120);
        expect(words(p.text)).toBeLessThan(360);
        expect(p.questions).toHaveLength(3);
        for (const q of p.questions) {
          expect(q.options).toHaveLength(3);
          expect(new Set(q.options).size).toBe(3);
          expect(q.answer).toBeGreaterThanOrEqual(0);
          expect(q.answer).toBeLessThan(3);
          expect(q.question.trim()).toMatch(/\?$/);
        }
        expect(p.gloss.length).toBeGreaterThan(2);
        for (const g of p.gloss) {
          expect(g.word.trim().length).toBeGreaterThan(1);
          expect(g.meaning.trim().length).toBeGreaterThan(1);
        }
      }
    }
    const answers = STORIES.flatMap((s) => s.parts.flatMap((p) => p.questions.map((q) => q.answer)));
    for (const i of [0, 1, 2]) expect(answers.filter((a) => a === i).length / answers.length).toBeGreaterThan(0.25);
  });

  it('keeps the spelling modern: no ß after a short vowel, no th in Tür, Tier, Tal, Mut, tun', () => {
    const old = /\b(daß|muß\w*|wuß\w*|läßt|gieng|fieng|giebt|Thür\w*|Thier\w*|Thal\b|Muth\w*|thun|that\b|gethan|Thaler|roth\w*|Noth\b|todt\w*|sey\w*)\b/i;
    for (const s of STORIES) for (const p of s.parts) expect(p.text, `${s.id}`).not.toMatch(old);
  });

  it('offers the stories of the level, and the A2 ones to an A1 learner', () => {
    expect(storiesFor('A1').every((s) => s.level === 'A2')).toBe(true);
    expect(storiesFor('A1').length).toBeGreaterThan(0);
    expect(storiesFor('B1').every((s) => s.level === 'B1')).toBe(true);
    expect(storiesFor('C2').every((s) => s.level === 'C2')).toBe(true);
  });

  it('opens a part as a reading draft under its key, with empty checks and the story attached', () => {
    const s = STORIES.find((x) => x.parts.length > 1)!;
    const key = storyKey(s.id, 1);
    expect(parseStoryKey(key)).toEqual({ id: s.id, part: 1 });
    const r = storyReading(key)!;
    expect(r.title).toBe(s.title);
    expect(r.text).toBe(s.parts[1].text);
    expect(r.questions).toBe(s.parts[1].questions);
    expect(r.checks).toEqual({ lexicon: null, quotes: [], engine: null, grounded: [] });
    expect(r.level).toBe(s.level);
    expect(r.story).toBe(s);
    expect(r.part).toBe(1);
    expect(storyReading('A1:the family')).toBeNull();
    expect(storyReading(storyKey(s.id, 99))).toBeNull();
    expect(storyReading(storyKey('no-such-story', 0))).toBeNull();
    expect(storyReading(undefined)).toBeNull();
  });

  it('counts the parts done and points at the next one', () => {
    const s = STORIES.find((x) => x.parts.length >= 3)!;
    expect(storyProgress(s, {})).toEqual({ done: 0, next: 0 });
    expect(storyProgress(s, { [storyKey(s.id, 0)]: 1, [storyKey(s.id, 2)]: 1 })).toEqual({ done: 2, next: 1 });
    const all = Object.fromEntries(s.parts.map((_, i) => [storyKey(s.id, i), 1]));
    expect(storyProgress(s, all)).toEqual({ done: s.parts.length, next: null });
  });

  it('estimates minutes at a learner reading pace', () => {
    expect(storyMinutes(220)).toBe(2);
    expect(storyMinutes(1264)).toBe(11);
    expect(storyMinutes(10)).toBe(1);
  });
});
