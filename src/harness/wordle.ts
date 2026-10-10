// Five letters: a Wordle-style game for two people sharing one phone. They take turns guessing the same
// five-letter German noun on one shared board of six rows, so there is nothing to hide and no curtain; the
// one whose guess hits the word wins it. A match is a few words with the opening guess alternating, which
// keeps the turn order fair. Answers are the five-letter nouns of words.json (all curated, no ß, so they
// fit the on-screen keyboard), drawn up to the learners' level; a guess is any form the lexicon or the
// app's own texts know. When a word will not come, the board hints at it and the players may give it up.

import type { Rng } from './drills';
import { atOrBelow, type Level } from './levels';
import { articleLabel, wordVerdict, type WordSource } from './scrabble';
import wordsData from '@/data/words.json';

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;
export const ROUNDS = 4;
/** Guesses before the board tells the article, then (on the last guess) the meaning. */
export const HINT_AFTER = 3;
export const LAST_HINT_AFTER = 5;
/** Guesses before the players may give a word up; the same moment the first hint arrives. */
export const GIVE_UP_AFTER = HINT_AFTER;
/** A level's pool must hold this many words, else the match draws from every answer. */
export const MIN_POOL = ROUNDS * 3;
export const KEY_ROWS = ['QWERTZUIOPÜ', 'ASDFGHJKLÖÄ', 'YXCVBNM'] as const;

export type Mark = 'correct' | 'present' | 'absent';
export type GuessProblem = 'tooShort' | 'notAWord' | 'alreadyTried';

export interface Guess {
  player: 0 | 1;
  word: string;
  marks: Mark[];
}

export interface RoundResult {
  answer: string;
  /** Who found the word; null when six guesses were not enough or the players gave it up. */
  winner: 0 | 1 | null;
  guesses: number;
}

export interface WordleState {
  /** Upper-case answers for the whole match, one per round. */
  answers: string[];
  round: number;
  /** Guesses of the current round, oldest first. */
  guesses: Guess[];
  results: RoundResult[];
  scores: [number, number];
}

/** What the board may tell about the word: its article, its meaning (in English, translated on display), or its first letter when no meaning is known. */
export type Hint = { kind: 'article'; article: string } | { kind: 'meaning'; lemma: string; meaning: string } | { kind: 'letter'; letter: string };

const words = wordsData as { nouns: Record<string, string>; levels: Record<string, Level> };
const ANSWER_PATTERN = /^[A-ZÄÖÜ][a-zäöü]{4}$/;
// a noun that reads like another word's plural, or an exclamation, makes a poor puzzle
const UNSUITED = new Set(['Namen', 'Hallo']);

/** The lemmas a match draws from, as written in the lexicon ("Apfel", not "APFEL"). */
export const ANSWERS: readonly string[] = Object.keys(words.nouns)
  .filter((lemma) => ANSWER_PATTERN.test(lemma) && !UNSUITED.has(lemma))
  .sort((a, b) => a.localeCompare(b, 'de'));

/** The level each answer is first met at (build-words.mjs: the lexicon's, else the lowest text using it). */
export const ANSWER_LEVELS: Readonly<Record<string, Level>> = Object.fromEntries(ANSWERS.map((lemma) => [lemma, words.levels[lemma]]).filter(([, level]) => level));

/** The answers at or below a level (an unlevelled word is allowed everywhere); every answer when that would be too few. */
export function answersFor(level: Level): readonly string[] {
  const pool = ANSWERS.filter((lemma) => !ANSWER_LEVELS[lemma] || atOrBelow(ANSWER_LEVELS[lemma], level));
  return pool.length >= MIN_POOL ? pool : ANSWERS;
}

export const normalise = (word: string) => word.toUpperCase();

export function newMatch(rng: Rng, rounds = ROUNDS, pool: readonly string[] = ANSWERS): WordleState {
  const answers = rng.shuffle(pool).slice(0, rounds).map(normalise);
  return { answers, round: 0, guesses: [], results: [], scores: [0, 0] };
}

export const answerOf = (state: WordleState) => state.answers[state.round];
export const roundDone = (state: WordleState) => state.results.length > state.round;
export const over = (state: WordleState) => state.results.length === state.answers.length;

/** Whose guess it is: the opening guess alternates with the round, then the players alternate. */
export const turnOf = (state: WordleState): 0 | 1 => ((state.round + state.guesses.length) % 2) as 0 | 1;

/** Standard two-pass marking, so a letter is "present" only as often as it is in the answer. */
export function markGuess(guess: string, answer: string): Mark[] {
  const g = [...normalise(guess)];
  const a = [...normalise(answer)];
  const marks = g.map<Mark>(() => 'absent');
  const left = new Map<string, number>();
  g.forEach((letter, i) => {
    if (letter === a[i]) marks[i] = 'correct';
    else left.set(a[i], (left.get(a[i]) ?? 0) + 1);
  });
  g.forEach((letter, i) => {
    const n = left.get(letter) ?? 0;
    if (marks[i] === 'absent' && n > 0) {
      marks[i] = 'present';
      left.set(letter, n - 1);
    }
  });
  return marks;
}

const RANK: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };

/** The best thing known about each letter tried so far, for colouring the keyboard. */
export function keyboardMarks(guesses: readonly Guess[]): Record<string, Mark> {
  const out: Record<string, Mark> = {};
  for (const { word, marks } of guesses) {
    [...word].forEach((letter, i) => {
      const seen = out[letter];
      if (!seen || RANK[marks[i]] > RANK[seen]) out[letter] = marks[i];
    });
  }
  return out;
}

/** Why a guess cannot be entered yet; null when it can. */
export function guessProblem(state: WordleState, word: string, lex: WordSource | null): GuessProblem | null {
  const w = normalise(word);
  if ([...w].length < WORD_LENGTH) return 'tooShort';
  if (state.guesses.some((g) => g.word === w)) return 'alreadyTried';
  if (wordVerdict(w, lex).kind === 'unknown') return 'notAWord';
  return null;
}

/** Adds a valid guess; the round closes when it hits the word or was the sixth try. */
export function submitGuess(state: WordleState, word: string): WordleState {
  if (roundDone(state) || over(state)) return state;
  const w = normalise(word);
  const player = turnOf(state);
  const marks = markGuess(w, answerOf(state));
  const guesses = [...state.guesses, { player, word: w, marks }];
  const solved = marks.every((m) => m === 'correct');
  if (!solved && guesses.length < MAX_GUESSES) return { ...state, guesses };
  const scores: [number, number] = [...state.scores];
  if (solved) scores[player] += 1;
  return { ...state, guesses, scores, results: [...state.results, { answer: answerOf(state), winner: solved ? player : null, guesses: guesses.length }] };
}

export function nextRound(state: WordleState): WordleState {
  if (!roundDone(state) || over(state)) return state;
  return { ...state, round: state.round + 1, guesses: [] };
}

/** Whether the players may give the word up: a few guesses in, while the round is open. */
export const canGiveUp = (state: WordleState) => !roundDone(state) && !over(state) && state.guesses.length >= GIVE_UP_AFTER;

/** Closes the round with no winner; the guesses stay on the board for the reveal. */
export function giveUp(state: WordleState): WordleState {
  if (!canGiveUp(state)) return state;
  return { ...state, results: [...state.results, { answer: answerOf(state), winner: null, guesses: state.guesses.length }] };
}

/**
 * What the board may tell about the word at this point: nothing for the first guesses, the article once
 * HINT_AFTER guesses missed, and for the last guess the meaning (or the first letter, for a word the
 * lexicon has no meaning for). The article is always known, as every answer is a noun of words.json.
 */
export function hintFor(state: WordleState, lex: WordSource | null): Hint | null {
  if (roundDone(state) || over(state) || state.guesses.length < HINT_AFTER) return null;
  const answer = answerOf(state);
  const v = wordVerdict(answer, lex);
  const letter = { kind: 'letter', letter: answer[0] } as const;
  if (state.guesses.length < LAST_HINT_AFTER) {
    const article = articleLabel(v);
    return article ? { kind: 'article', article } : letter;
  }
  return v.kind === 'noun' && v.meaning ? { kind: 'meaning', lemma: v.lemma, meaning: v.meaning } : letter;
}

export function winner(state: WordleState): 0 | 1 | null {
  if (state.scores[0] === state.scores[1]) return null;
  return state.scores[0] > state.scores[1] ? 0 : 1;
}
