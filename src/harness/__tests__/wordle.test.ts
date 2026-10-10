import { describe, expect, it } from 'vitest';

import lexiconCore from '../../data/lexicon-core.json';
import { makeRng } from '../drills';
import { LexiconIndex, type LexiconData } from '../lexicon';
import { wordVerdict } from '../scrabble';
import { LEVELS } from '../levels';
import {
  ANSWER_LEVELS,
  ANSWERS,
  answerOf,
  answersFor,
  canGiveUp,
  giveUp,
  guessProblem,
  HINT_AFTER,
  hintFor,
  keyboardMarks,
  KEY_ROWS,
  LAST_HINT_AFTER,
  markGuess,
  MAX_GUESSES,
  MIN_POOL,
  newMatch,
  nextRound,
  over,
  ROUNDS,
  roundDone,
  submitGuess,
  turnOf,
  winner,
  WORD_LENGTH,
  type WordleState,
} from '../wordle';

const coreLex = new LexiconIndex(lexiconCore as unknown as LexiconData);
const keys = new Set(KEY_ROWS.join(''));
const withAnswers = (answers: string[]): WordleState => ({ answers, round: 0, guesses: [], results: [], scores: [0, 0] });

describe('five letters: answers', () => {
  it('draws from a good number of curated five-letter nouns the keyboard can spell', () => {
    expect(ANSWERS.length).toBeGreaterThan(150);
    for (const lemma of ANSWERS) {
      expect([...lemma]).toHaveLength(WORD_LENGTH);
      expect(lemma).toMatch(/^[A-ZÄÖÜ][a-zäöü]{4}$/);
      for (const letter of lemma.toUpperCase()) expect(keys.has(letter)).toBe(true);
      expect(wordVerdict(lemma, null).kind).toBe('noun');
    }
    expect(ANSWERS).toContain('Apfel');
    expect(ANSWERS).not.toContain('Namen');
  });

  it('picks distinct upper-case answers for every round, reproducibly', () => {
    const a = newMatch(makeRng(7));
    const b = newMatch(makeRng(7));
    expect(a.answers).toEqual(b.answers);
    expect(a.answers).toHaveLength(ROUNDS);
    expect(new Set(a.answers).size).toBe(ROUNDS);
    for (const w of a.answers) expect(w).toBe(w.toUpperCase());
    expect(newMatch(makeRng(1), 2).answers).toHaveLength(2);
  });

  it('knows the level every answer is first met at and pools them up to the learners\' level', () => {
    for (const lemma of ANSWERS) expect(LEVELS).toContain(ANSWER_LEVELS[lemma]);
    expect(ANSWER_LEVELS.Abend).toBe('A1');
    expect(ANSWER_LEVELS.Ethik).toBe('C1');
    let last = 0;
    for (const level of LEVELS) {
      const pool = answersFor(level);
      expect(pool.length).toBeGreaterThanOrEqual(Math.max(MIN_POOL, last));
      for (const lemma of pool) expect(LEVELS.indexOf(ANSWER_LEVELS[lemma])).toBeLessThanOrEqual(LEVELS.indexOf(level));
      last = pool.length;
    }
    expect(answersFor('A1')).toContain('Abend');
    expect(answersFor('A1')).not.toContain('Ethik');
    expect(answersFor('C2')).toEqual(ANSWERS);
    // a match drawn from a pool only uses that pool
    const match = newMatch(makeRng(3), ROUNDS, answersFor('A1'));
    for (const w of match.answers) expect(answersFor('A1').map((l) => l.toUpperCase())).toContain(w);
  });
});

describe('five letters: marking', () => {
  it('marks right place, elsewhere and absent', () => {
    expect(markGuess('SEHEN', 'ESSEN')).toEqual(['present', 'present', 'absent', 'correct', 'correct']);
    expect(markGuess('ESSEN', 'ESSEN')).toEqual(['correct', 'correct', 'correct', 'correct', 'correct']);
    expect(markGuess('BLICK', 'WOLKE')).toEqual(['absent', 'present', 'absent', 'absent', 'present']);
  });

  it('counts a repeated letter only as often as the answer has it', () => {
    expect(markGuess('EEEEE', 'ESSEN')).toEqual(['correct', 'absent', 'absent', 'correct', 'absent']);
    expect(markGuess('NEEEE', 'ESSEN')).toEqual(['present', 'present', 'absent', 'correct', 'absent']);
    expect(markGuess('SSSSS', 'KASSE')).toEqual(['absent', 'absent', 'correct', 'correct', 'absent']);
  });

  it('is case-insensitive and handles umlauts', () => {
    expect(markGuess('ärger', 'ÄRGER')).toEqual(Array<string>(5).fill('correct'));
    expect(markGuess('GLÜCK', 'KÜCHE')).toEqual(['absent', 'absent', 'present', 'present', 'present']);
  });

  it('colours the keyboard with the best mark seen for each letter', () => {
    const marks = keyboardMarks([
      { player: 0, word: 'SEHEN', marks: markGuess('SEHEN', 'ESSEN') },
      { player: 1, word: 'ESSIG', marks: markGuess('ESSIG', 'ESSEN') },
    ]);
    expect(marks.E).toBe('correct');
    expect(marks.S).toBe('correct');
    expect(marks.N).toBe('correct');
    expect(marks.H).toBe('absent');
    expect(marks.I).toBe('absent');
    expect(marks.G).toBe('absent');
    expect(marks.A).toBeUndefined();
  });
});

describe('five letters: a match', () => {
  it('refuses short words, words nobody knows and repeats, but takes real German', () => {
    const s = withAnswers(['ESSEN']);
    expect(guessProblem(s, 'ESS', coreLex)).toBe('tooShort');
    expect(guessProblem(s, 'QQQQQ', coreLex)).toBe('notAWord');
    expect(guessProblem(s, 'Apfel', coreLex)).toBeNull();
    expect(guessProblem(s, 'gehen', coreLex)).toBeNull();
    expect(guessProblem(s, 'ärger', null)).toBeNull();
    const tried = submitGuess(s, 'APFEL');
    expect(guessProblem(tried, 'apfel', coreLex)).toBe('alreadyTried');
    expect(guessProblem(tried, 'BLICK', coreLex)).toBeNull();
  });

  it('alternates players and gives the word to whoever hits it', () => {
    let s = withAnswers(['ESSEN', 'APFEL']);
    expect(turnOf(s)).toBe(0);
    s = submitGuess(s, 'SEHEN');
    expect(s.guesses).toEqual([{ player: 0, word: 'SEHEN', marks: ['present', 'present', 'absent', 'correct', 'correct'] }]);
    expect(turnOf(s)).toBe(1);
    expect(roundDone(s)).toBe(false);
    s = submitGuess(s, 'essen');
    expect(roundDone(s)).toBe(true);
    expect(over(s)).toBe(false);
    expect(s.results).toEqual([{ answer: 'ESSEN', winner: 1, guesses: 2 }]);
    expect(s.scores).toEqual([0, 1]);
    // nothing more goes on a finished round
    expect(submitGuess(s, 'APFEL')).toBe(s);

    s = nextRound(s);
    expect(s.round).toBe(1);
    expect(s.guesses).toEqual([]);
    expect(answerOf(s)).toBe('APFEL');
    // the second player opens the second word
    expect(turnOf(s)).toBe(1);
    expect(nextRound(s)).toBe(s);
  });

  it('closes a round after six misses with no point for anyone and ends the match after the last word', () => {
    let s = withAnswers(['ESSEN']);
    for (const w of ['BLICK', 'WOLKE', 'KASSE', 'APFEL', 'GLÜCK', 'KÜCHE']) s = submitGuess(s, w);
    expect(s.guesses).toHaveLength(MAX_GUESSES);
    expect(s.results).toEqual([{ answer: 'ESSEN', winner: null, guesses: MAX_GUESSES }]);
    expect(s.scores).toEqual([0, 0]);
    expect(over(s)).toBe(true);
    expect(winner(s)).toBeNull();
    expect(nextRound(s)).toBe(s);
  });

  it('hints at the article after a few misses and at the meaning for the last guess', () => {
    let s = withAnswers(['BLUSE']);
    expect(hintFor(s, coreLex)).toBeNull();
    for (const w of ['APFEL', 'WOLKE']) s = submitGuess(s, w);
    expect(hintFor(s, coreLex)).toBeNull();
    s = submitGuess(s, 'KASSE');
    expect(s.guesses).toHaveLength(HINT_AFTER);
    expect(hintFor(s, coreLex)).toEqual({ kind: 'article', article: 'die' });
    s = submitGuess(s, 'GLÜCK');
    expect(hintFor(s, coreLex)).toEqual({ kind: 'article', article: 'die' });
    s = submitGuess(s, 'KÜCHE');
    expect(s.guesses).toHaveLength(LAST_HINT_AFTER);
    expect(hintFor(s, coreLex)).toEqual({ kind: 'meaning', lemma: 'Bluse', meaning: 'blouse' });
    // without the lexicon there is no meaning to give, so the first letter steps in
    expect(hintFor(s, null)).toEqual({ kind: 'letter', letter: 'B' });
    s = submitGuess(s, 'BLUSE');
    expect(hintFor(s, coreLex)).toBeNull();
  });

  it('lets the players give a word up once hints have started, with no point for anyone', () => {
    let s = withAnswers(['ESSEN', 'APFEL']);
    expect(canGiveUp(s)).toBe(false);
    expect(giveUp(s)).toBe(s);
    for (const w of ['BLICK', 'WOLKE', 'KASSE']) s = submitGuess(s, w);
    expect(canGiveUp(s)).toBe(true);
    const given = giveUp(s);
    expect(roundDone(given)).toBe(true);
    expect(given.results).toEqual([{ answer: 'ESSEN', winner: null, guesses: 3 }]);
    expect(given.guesses).toHaveLength(3);
    expect(given.scores).toEqual([0, 0]);
    expect(canGiveUp(given)).toBe(false);
    expect(hintFor(given, coreLex)).toBeNull();
    expect(nextRound(given).round).toBe(1);
  });

  it('names the player with more words as the winner', () => {
    let s = withAnswers(['ESSEN', 'APFEL', 'BLICK']);
    s = submitGuess(s, 'ESSEN');
    s = nextRound(s);
    s = submitGuess(s, 'APFEL');
    s = nextRound(s);
    s = submitGuess(s, 'BLICK');
    expect(s.scores).toEqual([2, 1]);
    expect(over(s)).toBe(true);
    expect(winner(s)).toBe(0);
  });
});
