import { describe, expect, it } from 'vitest';

import lexiconCore from '../../data/lexicon-core.json';
import words from '../../data/words.json';
import { makeRng } from '../drills';
import { LexiconIndex, type LexiconData } from '../lexicon';
import {
  BAG_SIZE,
  BINGO_BONUS,
  BONUS,
  canSwap,
  cellAt,
  CENTRE,
  commitMove,
  judgeMove,
  lastMove,
  newGame,
  PASS_LIMIT,
  passTurn,
  RACK_SIZE,
  type ScrabbleState,
  shuffleRack,
  SIZE,
  swapTiles,
  VALUES,
  winner,
  wordVerdict,
} from '../scrabble';

const coreLex = new LexiconIndex(lexiconCore as unknown as LexiconData);
const empty = () => Array<string | null>(SIZE * SIZE).fill(null);
const lay = (board: (string | null)[], r: number, c: number, word: string, down = false) => {
  for (let i = 0; i < word.length; i += 1) board[down ? cellAt(r + i, c) : cellAt(r, c + i)] = word[i];
  return board;
};
const place = (r: number, c: number, word: string, down = false) => word.split('').map((letter, i) => ({ cell: down ? cellAt(r + i, c) : cellAt(r, c + i), letter }));

describe('word tiles: board and bag', () => {
  it('has a symmetric 11×11 bonus layout with a double-word star in the centre', () => {
    expect(BONUS).toHaveLength(SIZE * SIZE);
    expect(BONUS[CENTRE]).toBe('DW');
    for (let r = 0; r < SIZE; r += 1) for (let c = 0; c < SIZE; c += 1) {
      expect(BONUS[cellAt(r, c)]).toBe(BONUS[cellAt(c, r)]);
      expect(BONUS[cellAt(r, c)]).toBe(BONUS[cellAt(SIZE - 1 - r, SIZE - 1 - c)]);
    }
    expect(BONUS.filter((b) => b === 'TW')).toHaveLength(8);
  });

  it('deals seven tiles each from a 62-tile bag', () => {
    const g = newGame(makeRng(7));
    expect(BAG_SIZE).toBe(62);
    expect(g.racks[0]).toHaveLength(RACK_SIZE);
    expect(g.racks[1]).toHaveLength(RACK_SIZE);
    expect(g.bag).toHaveLength(BAG_SIZE - 2 * RACK_SIZE);
    for (const l of [...g.bag, ...g.racks[0], ...g.racks[1]]) expect(VALUES[l]).toBeGreaterThan(0);
    expect(g.board.every((c) => c === null)).toBe(true);
    expect(newGame(makeRng(7))).toEqual(g);
  });
});

describe('word tiles: judging a move', () => {
  it('rejects an empty move and tiles that are not in one line', () => {
    expect(judgeMove(empty(), [])).toEqual({ ok: false, reason: 'empty' });
    expect(judgeMove(empty(), [{ cell: CENTRE, letter: 'A' }, { cell: CENTRE + SIZE + 1, letter: 'B' }])).toEqual({ ok: false, reason: 'notInLine' });
  });

  it('wants the first word over the star, at least two letters long', () => {
    expect(judgeMove(empty(), place(0, 0, 'HAUS'))).toEqual({ ok: false, reason: 'centre' });
    expect(judgeMove(empty(), [{ cell: CENTRE, letter: 'A' }])).toEqual({ ok: false, reason: 'tooShort' });
    const j = judgeMove(empty(), place(5, 3, 'HAUS'));
    expect(j.ok).toBe(true);
    if (!j.ok) return;
    expect(j.words.map((w) => w.word)).toEqual(['HAUS']);
    // H2 A1 U1 S1 = 5, doubled by the star
    expect(j.score).toBe(10);
    expect(j.bingo).toBe(false);
  });

  it('refuses gaps and tiles that touch nothing', () => {
    const board = lay(empty(), 5, 3, 'HAUS');
    expect(judgeMove(board, [{ cell: cellAt(5, 2), letter: 'B' }, { cell: cellAt(5, 8), letter: 'E' }])).toEqual({ ok: false, reason: 'gap' });
    expect(judgeMove(board, [{ cell: cellAt(5, 8), letter: 'E' }])).toEqual({ ok: false, reason: 'notConnected' });
    expect(judgeMove(board, place(0, 0, 'AN'))).toEqual({ ok: false, reason: 'notConnected' });
    expect(judgeMove(board, [{ cell: cellAt(9, 9), letter: 'E' }])).toEqual({ ok: false, reason: 'notConnected' });
    expect(judgeMove(board, [{ cell: cellAt(5, 3), letter: 'M' }])).toEqual({ ok: false, reason: 'gap' });
  });

  it('extends a word through existing tiles and reads a single tile the longer way', () => {
    const board = lay(empty(), 5, 3, 'HAUS');
    const ext = judgeMove(board, [{ cell: cellAt(5, 7), letter: 'E' }, { cell: cellAt(5, 8), letter: 'S' }]);
    expect(ext.ok && ext.words.map((w) => w.word)).toEqual(['HAUSES']);
    const down = judgeMove(board, place(6, 3, 'UT', true));
    expect(down.ok && down.words.map((w) => w.word)).toEqual(['HUT']);
    // A lone tile below the A reads vertically (AN) and horizontally only if a neighbour exists.
    const lone = judgeMove(board, [{ cell: cellAt(6, 4), letter: 'N' }]);
    expect(lone.ok && lone.words.map((w) => w.word)).toEqual(['AN']);
  });

  it('scores cross words and applies letter and word bonuses to new tiles only', () => {
    // HAUS on row 5, columns 3-6, with the star under the U at (5,5).
    const board = lay(empty(), 5, 3, 'HAUS');
    // SEE down from the S: the E at (6,6) sits on a double-letter cell, the E at (7,6) on a plain one.
    const j = judgeMove(board, place(6, 6, 'EE', true));
    expect(j.ok).toBe(true);
    if (!j.ok) return;
    expect(j.words.map((w) => w.word)).toEqual(['SEE']);
    expect(j.score).toBe(4);
    // A parallel play under US forms ES and the cross words UE and SS.
    const par = judgeMove(board, place(6, 5, 'ES'));
    expect(par.ok).toBe(true);
    if (!par.ok) return;
    expect(par.words.map((w) => w.word).sort()).toEqual(['ES', 'SS', 'UE']);
    // The S at (6,6) is on the double-letter cell: ES = 1+2, UE = 1+1, SS = 1+2.
    expect(par.score).toBe(8);
  });

  it('pays the bingo bonus for laying all seven tiles', () => {
    const j = judgeMove(empty(), place(5, 2, 'ARBEITE'));
    expect(j.ok && j.bingo).toBe(true);
    if (!j.ok) return;
    // A1 R1 B3 E1 I1 T1 E1 = 9; (5,2) is TL in 'T.t..*..t.T' → A counts 3 → 11; star doubles → 22; (5,8) is TL → E counts 3 → 13 × 2 = 26.
    expect(j.score).toBe(26 + BINGO_BONUS);
  });
});

describe('word tiles: verdicts', () => {
  it('recognises nouns with their article, plurals and other forms', () => {
    expect(wordVerdict('HAUS', coreLex)).toMatchObject({ kind: 'noun', lemma: 'Haus', articles: ['das'] });
    expect(wordVerdict('ABEND', coreLex)).toMatchObject({ kind: 'noun', lemma: 'Abend', articles: ['der'], meaning: 'evening' });
    expect(wordVerdict('ABENDE', coreLex)).toMatchObject({ kind: 'plural', lemma: 'Abend' });
    expect(wordVerdict('HÄUSER', coreLex)).toMatchObject({ kind: 'plural' });
    expect(wordVerdict('UND', coreLex)).toMatchObject({ kind: 'word' });
    expect(wordVerdict('GING', coreLex)).toMatchObject({ kind: 'word', lemma: 'gehen', meaning: 'to go, walk' });
    expect(wordVerdict('FÄHRST', null)).toMatchObject({ kind: 'word' });
  });

  it('names the lemma and meaning of the words the model added, their inflected forms included', () => {
    const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
    const isNoun = (w: string) => cap(w) in words.nouns || words.plurals.includes(cap(w));
    const meanings = words.meanings as Record<string, string>;
    const entries = Object.entries(words.lemmaOf).filter(([form, lemma]) => !isNoun(form) && !isNoun(lemma) && !coreLex.verb(form));
    const described = entries.filter(([, lemma]) => meanings[lemma]);
    expect(described.length).toBeGreaterThan(100);
    for (const [form, lemma] of described.slice(0, 20)) {
      expect(wordVerdict(form.toUpperCase(), coreLex)).toEqual({ kind: 'word', lemma, meaning: meanings[lemma] });
      expect(wordVerdict(lemma.toUpperCase(), null)).toEqual({ kind: 'word', lemma, meaning: meanings[lemma] });
    }
    // declined and compared by rule: an adjective form names its lemma even where nobody has a meaning for it
    expect(wordVerdict('SCHNELLE', coreLex)).toMatchObject({ kind: 'word', lemma: 'schnell' });
    expect(wordVerdict('BESSER', coreLex)).toMatchObject({ kind: 'word', lemma: 'gut' });
    expect(wordVerdict('ROTEN', coreLex)).toMatchObject({ kind: 'word', lemma: 'rot' });
    expect(wordVerdict('AUFGESTANDEN', coreLex)).toMatchObject({ kind: 'word', lemma: 'aufstehen' });
    const plainLemma = entries.find(([, lemma]) => !meanings[lemma]);
    if (plainLemma) expect(wordVerdict(plainLemma[0].toUpperCase(), coreLex)).toEqual({ kind: 'word', lemma: plainLemma[1], meaning: undefined });
    // a form only the texts contributed knows neither lemma nor meaning, and is not repeated under the model's words
    const plain = words.forms.find((f) => !isNoun(f) && !coreLex.verb(f));
    expect(plain).toBeTruthy();
    expect(wordVerdict(plain!.toUpperCase(), coreLex)).toEqual({ kind: 'word', lemma: undefined, meaning: undefined });
    for (const f of Object.keys(words.lemmaOf)) expect(words.forms).not.toContain(f);
  });

  it('shows the gender a learner should use, not every gender the lenient table attests', () => {
    const lenient = {
      ...coreLex,
      articlesOf: (lemma: string) => (lemma === 'Bus' ? (['die', 'der'] as const) : lemma === 'Joghurt' ? (['der', 'das'] as const) : []).slice(),
      noun: (lemma: string) => (lemma === 'Joghurt' ? { genus: 'm', meaning: 'yoghurt' } : undefined),
      isPluralForm: () => false,
      lemmaOfPlural: () => undefined,
      verb: () => undefined,
    };
    // words.json carries the curated "der Bus"; the described noun's own genus wins over the table
    expect(wordVerdict('BUS', lenient)).toMatchObject({ kind: 'noun', lemma: 'Bus', articles: ['der'] });
    expect(wordVerdict('JOGHURT', lenient)).toMatchObject({ kind: 'noun', lemma: 'Joghurt', articles: ['der'], meaning: 'yoghurt' });
    // a noun neither words.json nor the described nouns know falls back to the table, every gender shown
    expect(wordVerdict('ZYKLOP', { ...lenient, articlesOf: (l: string) => (l === 'Zyklop' ? ['der', 'das'] : []) })).toMatchObject({ kind: 'noun', articles: ['der', 'das'] });
  });

  it('looks up words laid with SS under their ß spelling', () => {
    expect(wordVerdict('STRASSE', coreLex)).toMatchObject({ kind: 'noun', lemma: 'Straße', articles: ['die'] });
    expect(wordVerdict('GROSS', null)).toMatchObject({ kind: 'word' });
  });

  it('knows nothing of names, abbreviations or English', () => {
    for (const w of ['ANNA', 'WIEN', 'ABC', 'HAVE', 'XQZ']) expect(wordVerdict(w, coreLex)).toEqual({ kind: 'unknown' });
    expect(words.nouns).not.toHaveProperty('Anna');
    expect(words.forms).not.toContain('ling');
  });

  it('answers without a lexicon from the bundled word list alone', () => {
    expect(wordVerdict('HAUS', null)).toMatchObject({ kind: 'noun', articles: ['das'] });
    expect(wordVerdict('KINDER', null)).toMatchObject({ kind: 'plural' });
  });
});

describe('word tiles: a game', () => {
  const fixed = (): ScrabbleState => ({
    board: empty(),
    racks: [['H', 'A', 'U', 'S', 'E', 'N', 'R'], ['T', 'I', 'E', 'R', 'S', 'O', 'B']],
    bag: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    turn: 0,
    scores: [0, 0],
    passes: 0,
    moves: [],
    over: false,
  });

  it('commits a move: tiles leave the rack, new ones are drawn, the turn passes', () => {
    const s0 = fixed();
    const placements = place(5, 3, 'HAUS');
    const j = judgeMove(s0.board, placements);
    if (!j.ok) throw new Error(j.reason);
    const s1 = commitMove(s0, placements, j, [wordVerdict('HAUS', coreLex)]);
    expect(s1.board[cellAt(5, 3)]).toBe('H');
    expect(s1.racks[0]).toEqual(['E', 'N', 'R', 'A', 'B', 'C', 'D']);
    expect(s1.bag).toEqual(['E', 'F', 'G', 'H']);
    expect(s1.scores).toEqual([10, 0]);
    expect(s1.turn).toBe(1);
    expect(s1.passes).toBe(0);
    expect(lastMove(s1)).toMatchObject({ player: 0, kind: 'play', score: 10, words: [{ word: 'HAUS', verdict: { kind: 'noun', lemma: 'Haus' } }] });
    expect(s0.racks[0]).toHaveLength(7);
    expect(s0.board[CENTRE]).toBeNull();
  });

  it('ends when the bag is empty and a player goes out, moving the leftover tile values across', () => {
    const s0: ScrabbleState = { ...fixed(), racks: [['H', 'A', 'U', 'S'], ['X', 'E']], bag: [] };
    const placements = place(5, 3, 'HAUS');
    const j = judgeMove(s0.board, placements);
    if (!j.ok) throw new Error(j.reason);
    const s1 = commitMove(s0, placements, j, [{ kind: 'accepted' }]);
    expect(s1.over).toBe(true);
    expect(s1.endedBy).toBe('out');
    // X8 + E1 = 9 move from player two to player one
    expect(s1.scores).toEqual([19, -9]);
    expect(winner(s1)).toBe(0);
  });

  it('counts passes and swaps as scoreless turns and ends after four of them', () => {
    let s = fixed();
    expect(canSwap(s)).toBe(true);
    s = swapTiles(s, ['H', 'A'], makeRng(1));
    expect(s.turn).toBe(1);
    expect(s.passes).toBe(1);
    expect(s.racks[0]).toHaveLength(7);
    expect(s.racks[0]).not.toContain('H');
    expect(s.bag).toHaveLength(8);
    expect(s.bag.filter((l) => l === 'H')).toHaveLength(2);
    expect(lastMove(s)).toMatchObject({ kind: 'swap', count: 2 });
    s = passTurn(s);
    s = passTurn(s);
    expect(s.over).toBe(false);
    s = passTurn(s);
    expect(s.passes).toBe(PASS_LIMIT);
    expect(s.over).toBe(true);
    expect(s.endedBy).toBe('passes');
    expect(s.scores[0]).toBeLessThan(0);
    expect(s.scores[1]).toBeLessThan(0);
  });

  it('allows a swap only while a full rack is left in the bag', () => {
    const s: ScrabbleState = { ...fixed(), bag: ['A', 'B'] };
    expect(canSwap(s)).toBe(false);
    expect(swapTiles(s, ['H'], makeRng(1))).toBe(s);
  });

  it('shuffles a rack without changing its tiles', () => {
    const s = shuffleRack(fixed(), 0, makeRng(3));
    expect([...s.racks[0]].sort()).toEqual([...fixed().racks[0]].sort());
    expect(s.racks[1]).toEqual(fixed().racks[1]);
  });

  it('calls a draw when the scores are level', () => {
    expect(winner(fixed())).toBeNull();
    expect(winner({ ...fixed(), scores: [3, 9] })).toBe(1);
  });
});
