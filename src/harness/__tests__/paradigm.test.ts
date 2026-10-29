import { describe, expect, it } from 'vitest';

import grammarData from '../../data/grammar.json';
import { blankCells, paradigmsIn, ruleSegments, sameForm } from '../paradigm';
import type { GrammarCard } from '../tutor';

const grammar = grammarData as unknown as GrammarCard[];
const card = (key: string) => grammar.find((c) => c.key === key)!;

describe('paradigm tables in a rule', () => {
  it('lifts a pronoun run out of the sentence and keeps the text around it', () => {
    const segs = ruleSegments('Das Verb: ich gehe, du gehst, er geht, wir gehen, ihr geht, sie gehen. Das war alles.');
    expect(segs.map((s) => s.kind)).toEqual(['text', 'table', 'text']);
    expect(segs[0]).toEqual({ kind: 'text', text: 'Das Verb:' });
    expect(segs[1].kind === 'table' && segs[1].paradigm.rows).toEqual([['ich', 'gehe'], ['du', 'gehst'], ['er', 'geht'], ['wir', 'gehen'], ['ihr', 'geht'], ['sie', 'gehen']]);
    expect(segs[2]).toEqual({ kind: 'text', text: 'Das war alles.' });
  });

  it('reads the labelled runs of sein and haben as one table with a column each', () => {
    const [endings, verbs] = paradigmsIn(card('sein-haben-praesens').rule_de);
    expect(endings.rows[1]).toEqual(['du', 'wohn-st']);
    expect(verbs.labels).toEqual([null, 'sein', 'haben']);
    expect(verbs.rows).toEqual([['ich', 'bin', 'habe'], ['du', 'bist', 'hast'], ['er', 'ist', 'hat'], ['wir', 'sind', 'haben'], ['ihr', 'seid', 'habt'], ['sie', 'sind', 'haben']]);
    // the English rule carries the same German, so the same tables
    expect(paradigmsIn(card('sein-haben-praesens').rule_en)).toEqual([endings, verbs]);
  });

  it('reads case lists as a table with a column per case', () => {
    const [cases] = paradigmsIn(card('personalpronomen-akkusativ-dativ').rule_de);
    expect(cases.labels).toEqual(['Nominativ', 'Akkusativ', 'Dativ']);
    expect(cases.rows).toHaveLength(8);
    expect(cases.rows[2]).toEqual(['er', 'ihn', 'ihm']);
    expect(cases.rows[7]).toEqual(['sie/Sie', 'sie/Sie', 'ihnen/Ihnen']);
  });

  it('reads arrow runs, keeps a tense label, and leaves example lists in the text', () => {
    const [possessives] = paradigmsIn(card('possessivartikel').rule_de);
    expect(possessives.rows[0]).toEqual(['ich', 'mein']);
    expect(possessives.rows).toHaveLength(8);
    const [passive] = paradigmsIn(card('passiv-praesens').rule_de);
    expect(passive.labels).toEqual([null, 'Präsens']);
    expect(passive.rows[2]).toEqual(['er/sie/es', 'wird gefragt']);
    // "ich war, er hatte, sie konnte" is a list of examples, not a paradigm
    const prät = card('praeteritum-sein-haben-modalverben').rule_de;
    expect(paradigmsIn(prät)).toHaveLength(1);
    expect(paradigmsIn(prät)[0].labels).toEqual([null, 'sein', 'haben']);
    expect(ruleSegments(prät).at(-1)).toMatchObject({ kind: 'text' });
    expect(paradigmsIn('Ich bin hier, du bist dort.')).toEqual([]);
    expect(paradigmsIn('Nur ich, du und er/sie/es haben verschiedene Formen.')).toEqual([]);
  });

  it('finds tables in eight bundled cards and none elsewhere', () => {
    const withTables = grammar.filter((c) => paradigmsIn(c.rule_de).length).map((c) => c.key);
    expect(withTables).toEqual(['vokalwechsel', 'sein-haben-praesens', 'possessivartikel', 'personalpronomen-akkusativ-dativ', 'praeteritum-sein-haben-modalverben', 'hoefliche-bitten-konjunktiv-ii', 'lassen', 'passiv-praesens', 'konjunktiv-i-redewiedergabe']);
    for (const c of grammar) for (const p of paradigmsIn(c.rule_de)) for (const row of p.rows) expect(row, c.key).toHaveLength(p.labels.length);
  });

  it('compares typed forms loosely and blanks about half of a table, never a whole column', () => {
    expect(sameForm('Wohne', 'wohn-e')).toBe(true);
    expect(sameForm('haette', 'hätte')).toBe(true);
    expect(sameForm('wird  gefragt', 'wird gefragt')).toBe(true);
    expect(sameForm('hast', 'hat')).toBe(false);
    const [, verbs] = paradigmsIn(card('sein-haben-praesens').rule_de);
    for (const seed of [0, 1, 7]) {
      const cells = blankCells(verbs, seed);
      expect(cells.every((row) => row[0] === false)).toBe(true);
      for (let j = 1; j < verbs.labels.length; j += 1) {
        const n = cells.filter((row) => row[j]).length;
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThan(verbs.rows.length);
      }
    }
    expect(blankCells(verbs, 0)).not.toEqual(blankCells(verbs, 1));
  });
});
