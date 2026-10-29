import { describe, expect, it } from 'vitest';

import { makeRng } from '../drills';
import { LEVELS } from '../levels';
import { WHOAMI_BASE, WHOAMI_CARDS, WHOAMI_KIND_DE, WHOAMI_QUESTIONS, WHOAMI_STARTERS, whoAmICards, whoAmILemma, whoAmILevels, whoAmIScore } from '../whoami';

describe('Who am I? cards', () => {
  it('has at least ten cards at every level, each with three distinct hints', () => {
    for (const level of LEVELS) {
      const cards = WHOAMI_CARDS.filter((c) => c.level === level);
      expect(cards.length, level).toBeGreaterThanOrEqual(10);
      for (const card of cards) {
        expect(card.hints).toHaveLength(3);
        expect(new Set(card.hints).size).toBe(3);
        for (const h of card.hints) expect(h.trim().endsWith('.'), `${card.answer}: ${h}`).toBe(true);
        expect(WHOAMI_KIND_DE[card.kind]).toBeTruthy();
      }
    }
    expect(whoAmILevels()).toEqual(LEVELS);
  });

  it('keeps answers unique and the forms that also count distinct from the answer', () => {
    const answers = WHOAMI_CARDS.map((c) => c.answer);
    expect(new Set(answers).size).toBe(answers.length);
    for (const card of WHOAMI_CARDS) {
      expect(card.alts.length).toBeGreaterThan(0);
      for (const a of card.alts) expect(a.trim()).toBe(a);
      // the lemma is the answer without its article: "der Hund" -> "Hund", names stay as they are
      expect(card.answer.endsWith(whoAmILemma(card))).toBe(true);
      expect(/^(der|die|das) /.test(whoAmILemma(card))).toBe(false);
    }
  });

  it("does not give the answer away in a hint", () => {
    for (const card of WHOAMI_CARDS) {
      const lemma = whoAmILemma(card).toLowerCase();
      const words = lemma.split(' ').filter((w) => w.length > 3);
      for (const h of card.hints) {
        const hint = h.toLowerCase();
        for (const w of words) expect(hint.includes(w), `${card.answer}: ${h}`).toBe(false);
      }
    }
  });

  it('deals the level’s own cards first and never ones above the level', () => {
    const rng = makeRng(7);
    const b1 = whoAmICards('B1', rng, 12);
    expect(b1).toHaveLength(12);
    const own = WHOAMI_CARDS.filter((c) => c.level === 'B1').length;
    expect(b1.slice(0, own).every((c) => c.level === 'B1')).toBe(true);
    expect(b1.every((c) => ['A1', 'A2', 'B1'].includes(c.level))).toBe(true);
    const a1 = whoAmICards('A1', makeRng(3), 30);
    expect(a1.every((c) => c.level === 'A1')).toBe(true);
    expect(new Set(a1.map((c) => c.answer)).size).toBe(a1.length);
  });

  it('scores a quick guess higher and a hinted one lower, never below one', () => {
    expect(whoAmIScore(0, 0)).toBe(WHOAMI_BASE + WHOAMI_QUESTIONS);
    expect(whoAmIScore(5, 0)).toBeGreaterThan(whoAmIScore(10, 0));
    expect(whoAmIScore(10, 1)).toBe(whoAmIScore(10, 0) - 1);
    expect(whoAmIScore(WHOAMI_QUESTIONS, 3)).toBe(WHOAMI_BASE - 3);
    expect(whoAmIScore(WHOAMI_QUESTIONS, 99)).toBe(1);
  });

  it('offers question frames that are German yes/no questions', () => {
    expect(WHOAMI_STARTERS.length).toBeGreaterThanOrEqual(10);
    for (const q of WHOAMI_STARTERS) {
      expect(q.endsWith('?')).toBe(true);
      expect(/^(Bist|Lebst|Kann|Gibt|Kommst|Hast|Braucht|Kennt|Wohnst|Arbeitest)\b/.test(q), q).toBe(true);
    }
  });
});
