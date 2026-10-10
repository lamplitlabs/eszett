// Word tiles: a Scrabble-style game for two people sharing one phone. Everything here is pure and
// serialisable so the screen can persist a game and resume it. The board is 11×11 (15×15 makes cells too
// small to tap on a phone), the bag holds 62 tiles scaled from the official German set without Q and Y, and
// there are no blanks. A word is judged by the lexicon that ships with the model plus a list of forms
// harvested from the app's own German texts (scripts/build-words.mjs); anything neither knows is put to
// the other player, who accepts or rejects it.

import type { Rng } from './drills';
import type { Article } from './lexicon';
import wordsData from '@/data/words.json';

export const SIZE = 11;
export const RACK_SIZE = 7;
export const BINGO_BONUS = 50;
export const CENTRE = Math.floor(SIZE / 2) * SIZE + Math.floor(SIZE / 2);
/** Four scoreless turns in a row (passes or swaps) end the game. */
export const PASS_LIMIT = 4;

export type Bonus = 'TW' | 'DW' | 'TL' | 'DL' | null;

const LAYOUT = ['T..d.T.d..T', '.D.......D.', '..D..t..D..', 'd..D...D..d', '....d.d....', 'T.t..*..t.T', '....d.d....', 'd..D...D..d', '..D..t..D..', '.D.......D.', 'T..d.T.d..T'];
const BONUS_OF: Record<string, Bonus> = { T: 'TW', D: 'DW', t: 'TL', d: 'DL', '*': 'DW', '.': null };
/** The bonus under each cell, row-major. */
export const BONUS: readonly Bonus[] = LAYOUT.join('').split('').map((ch) => BONUS_OF[ch]);

/** Official German letter values. */
export const VALUES: Record<string, number> = {
  A: 1, B: 3, C: 4, D: 1, E: 1, F: 4, G: 2, H: 2, I: 1, J: 6, K: 4, L: 2, M: 3, N: 1, O: 2, P: 4, R: 1, S: 1, T: 1, U: 1, V: 6, W: 3, X: 8, Z: 3, Ä: 6, Ö: 8, Ü: 6,
};
const BAG: [string, number][] = [
  ['E', 8], ['N', 5], ['S', 4], ['I', 4], ['R', 4], ['T', 4], ['A', 4], ['U', 3], ['D', 2], ['H', 2], ['G', 2], ['L', 2], ['O', 2], ['M', 2], ['B', 2],
  ['W', 1], ['Z', 1], ['C', 1], ['F', 1], ['K', 1], ['P', 1], ['Ä', 1], ['J', 1], ['Ü', 1], ['V', 1], ['Ö', 1], ['X', 1],
];
export const BAG_SIZE = BAG.reduce((n, [, k]) => n + k, 0);

export interface Placement {
  cell: number;
  letter: string;
}

export type Verdict =
  | { kind: 'noun'; lemma: string; articles: Article[]; meaning?: string }
  | { kind: 'plural'; lemma?: string }
  /** Any other form the texts or the verb table know; `lemma` is the infinitive when it is a verb form. */
  | { kind: 'word'; lemma?: string; meaning?: string }
  | { kind: 'unknown' }
  /** The other player let an unknown word stand. */
  | { kind: 'accepted' };

export interface PlayedWord {
  word: string;
  score: number;
  verdict: Verdict;
}

export interface Move {
  player: 0 | 1;
  kind: 'play' | 'pass' | 'swap';
  words: PlayedWord[];
  score: number;
  bingo: boolean;
  /** Tiles exchanged in a swap. */
  count?: number;
}

export interface ScrabbleState {
  board: (string | null)[];
  racks: [string[], string[]];
  bag: string[];
  turn: 0 | 1;
  scores: [number, number];
  /** Consecutive scoreless turns. */
  passes: number;
  moves: Move[];
  over: boolean;
  endedBy?: 'out' | 'passes';
}

export interface FormedWord {
  cells: number[];
  word: string;
  score: number;
}

export type MoveProblem = 'empty' | 'notInLine' | 'gap' | 'centre' | 'tooShort' | 'notConnected';

export type Judged = { ok: true; words: FormedWord[]; score: number; bingo: boolean } | { ok: false; reason: MoveProblem };

/** The lexicon methods the game needs; `LexiconIndex` satisfies it, so do stubs in tests. */
export interface WordSource {
  articlesOf(lemma: string): Article[];
  noun(lemma: string): { genus?: string; meaning?: string } | undefined;
  isPluralForm(word: string): boolean;
  lemmaOfPlural(form: string): string | undefined;
  verb(form: string): { infinitive: string; meaning: string } | undefined;
}

const words = wordsData as { forms: string[]; nouns: Record<string, string>; plurals: string[]; meanings: Record<string, string>; lemmaOf: Record<string, string> };
/** Lowercase words: the texts' forms plus the model-named words (their lemmas carry a meaning, their inflected forms a lemma). */
const FORMS = new Set([...words.forms, ...Object.keys(words.lemmaOf), ...Object.keys(words.meanings).filter((w) => /^[a-zäöüß]/.test(w))]);
const PLURALS = new Set(words.plurals);
const GENDER_ARTICLE: Record<string, Article> = { m: 'der', f: 'die', n: 'das' };

export const row = (cell: number) => Math.floor(cell / SIZE);
export const col = (cell: number) => cell % SIZE;
export const cellAt = (r: number, c: number) => r * SIZE + c;

export function newGame(rng: Rng): ScrabbleState {
  const bag = rng.shuffle(BAG.flatMap(([letter, n]) => Array<string>(n).fill(letter)));
  const racks: [string[], string[]] = [bag.splice(0, RACK_SIZE), bag.splice(0, RACK_SIZE)];
  return { board: Array<string | null>(SIZE * SIZE).fill(null), racks, bag, turn: 0, scores: [0, 0], passes: 0, moves: [], over: false };
}

/** Extends from `cell` along one axis over occupied cells and returns the run (length 1 when alone). */
function run(board: (string | null)[], cell: number, horizontal: boolean): number[] {
  const step = horizontal ? 1 : SIZE;
  const same = (a: number, b: number) => (horizontal ? row(a) === row(b) : col(a) === col(b));
  let start = cell;
  while (start - step >= 0 && same(start - step, cell) && board[start - step]) start -= step;
  const cells: number[] = [];
  for (let c = start; c < board.length && same(c, cell) && board[c]; c += step) cells.push(c);
  return cells;
}

function scoreCells(board: (string | null)[], placed: Set<number>, cells: number[]): number {
  let sum = 0;
  let multiplier = 1;
  for (const c of cells) {
    const value = VALUES[board[c] ?? ''] ?? 0;
    const bonus = placed.has(c) ? BONUS[c] : null;
    if (bonus === 'DL') sum += value * 2;
    else if (bonus === 'TL') sum += value * 3;
    else sum += value;
    if (bonus === 'DW') multiplier *= 2;
    if (bonus === 'TW') multiplier *= 3;
  }
  return sum * multiplier;
}

/** Checks a set of placements against the board and names the words they form, with scores. */
export function judgeMove(board: (string | null)[], placements: Placement[]): Judged {
  if (!placements.length) return { ok: false, reason: 'empty' };
  if (placements.some((p) => board[p.cell])) return { ok: false, reason: 'gap' };
  const cells = placements.map((p) => p.cell);
  const rows = new Set(cells.map(row));
  const cols = new Set(cells.map(col));
  if (rows.size > 1 && cols.size > 1) return { ok: false, reason: 'notInLine' };
  const empty = board.every((c) => !c);
  const next = [...board];
  for (const p of placements) next[p.cell] = p.letter;
  const placed = new Set(cells);

  // A single tile may read either way; the longer run is the main word.
  let horizontal = rows.size === 1;
  if (cells.length === 1) horizontal = run(next, cells[0], true).length >= run(next, cells[0], false).length;
  const main = run(next, cells[0], horizontal);
  if (!cells.every((c) => main.includes(c))) return { ok: false, reason: 'gap' };
  if (empty) {
    if (!placed.has(CENTRE)) return { ok: false, reason: 'centre' };
    if (main.length < 2) return { ok: false, reason: 'tooShort' };
  } else if (main.length < 2) {
    return { ok: false, reason: 'notConnected' };
  }

  const formed: number[][] = [main];
  for (const c of cells) {
    const cross = run(next, c, !horizontal);
    if (cross.length >= 2) formed.push(cross);
  }
  if (!empty && !formed.some((w) => w.some((c) => !placed.has(c)))) return { ok: false, reason: 'notConnected' };

  const result = formed.map((w) => ({ cells: w, word: w.map((c) => next[c] ?? '').join(''), score: scoreCells(next, placed, w) }));
  const bingo = cells.length === RACK_SIZE;
  const score = result.reduce((n, w) => n + w.score, 0) + (bingo ? BINGO_BONUS : 0);
  return { ok: true, words: result, score, bingo };
}

/** The board has no ß tile, so "STRASSE" must also be looked up as "Straße". */
function spellings(word: string): string[] {
  const out = [word];
  const at: number[] = [];
  for (let i = word.indexOf('ss'); i >= 0 && at.length < 3; i = word.indexOf('ss', i + 2)) at.push(i);
  for (let mask = 1; mask < 1 << at.length; mask += 1) {
    let s = word;
    for (let k = at.length - 1; k >= 0; k -= 1) if (mask & (1 << k)) s = `${s.slice(0, at[k])}ß${s.slice(at[k] + 2)}`;
    out.push(s);
  }
  return out;
}

/** What a word laid on the board is, according to the lexicon and the app's own texts. */
export function wordVerdict(word: string, lex: WordSource | null): Verdict {
  const lower = word.toLowerCase();
  const capital = lower[0].toUpperCase() + lower.slice(1);
  // the article shown is the described noun's, else the curated one from words.json; the lexicon's whole
  // gender table comes last because it is lenient on purpose (it lists a regional "die Bus" next to "der Bus")
  for (const lemma of spellings(capital)) {
    const described = lex?.noun(lemma);
    const letters = described?.genus ?? words.nouns[lemma] ?? '';
    const articles = letters ? [...letters].map((g) => GENDER_ARTICLE[g]).filter(Boolean) : (lex?.articlesOf(lemma) ?? []);
    if (articles.length) return { kind: 'noun', lemma, articles, meaning: described?.meaning ?? words.meanings[lemma] };
  }
  for (const form of spellings(capital)) {
    if (lex?.isPluralForm(form) || PLURALS.has(form)) return { kind: 'plural', lemma: lex?.lemmaOfPlural(form) };
  }
  for (const form of spellings(lower)) {
    const verb = lex?.verb(form);
    if (verb) return { kind: 'word', lemma: verb.infinitive, meaning: verb.meaning };
    if (FORMS.has(form)) {
      // "schnelle" → schnell · fast: the model-named words know their lemma and meaning, the texts' plain forms do not
      const lemma = words.lemmaOf[form] ?? (form in words.meanings ? form : undefined);
      return { kind: 'word', lemma, meaning: lemma ? words.meanings[lemma] : undefined };
    }
  }
  return { kind: 'unknown' };
}

/** "der/die Joghurt" for the summaries; empty for anything but a noun. */
export function articleLabel(v: Verdict): string {
  return v.kind === 'noun' ? v.articles.join('/') : '';
}

const other = (p: 0 | 1): 0 | 1 => (p === 0 ? 1 : 0);
const tileValue = (rack: string[]) => rack.reduce((n, l) => n + (VALUES[l] ?? 0), 0);

function removeFromRack(rack: string[], letters: string[]): string[] {
  const out = [...rack];
  for (const l of letters) {
    const i = out.indexOf(l);
    if (i < 0) throw new Error(`tile ${l} is not on the rack`);
    out.splice(i, 1);
  }
  return out;
}

function draw(bag: string[], n: number): { drawn: string[]; bag: string[] } {
  const rest = [...bag];
  return { drawn: rest.splice(0, Math.max(0, Math.min(n, rest.length))), bag: rest };
}

/** Lays the judged tiles for the current player, scores them, draws new tiles and ends the game when due. */
export function commitMove(state: ScrabbleState, placements: Placement[], judged: Judged & { ok: true }, verdicts: Verdict[]): ScrabbleState {
  const player = state.turn;
  const board = [...state.board];
  for (const p of placements) board[p.cell] = p.letter;
  const rack = removeFromRack(state.racks[player], placements.map((p) => p.letter));
  const { drawn, bag } = draw(state.bag, placements.length);
  const racks: [string[], string[]] = [...state.racks];
  racks[player] = [...rack, ...drawn];
  const scores: [number, number] = [...state.scores];
  scores[player] += judged.score;
  const move: Move = { player, kind: 'play', words: judged.words.map((w, i) => ({ word: w.word, score: w.score, verdict: verdicts[i] ?? { kind: 'unknown' } })), score: judged.score, bingo: judged.bingo };
  const next: ScrabbleState = { ...state, board, racks, bag, scores, passes: 0, moves: [...state.moves, move], turn: other(player) };
  if (!bag.length && !racks[player].length) {
    const left = tileValue(racks[other(player)]);
    next.scores[player] += left;
    next.scores[other(player)] -= left;
    next.over = true;
    next.endedBy = 'out';
  }
  return next;
}

function scoreless(state: ScrabbleState, move: Move): ScrabbleState {
  const next: ScrabbleState = { ...state, passes: state.passes + 1, moves: [...state.moves, move], turn: other(state.turn) };
  if (next.passes >= PASS_LIMIT) {
    next.scores = [state.scores[0] - tileValue(state.racks[0]), state.scores[1] - tileValue(state.racks[1])];
    next.over = true;
    next.endedBy = 'passes';
  }
  return next;
}

export function passTurn(state: ScrabbleState): ScrabbleState {
  return scoreless(state, { player: state.turn, kind: 'pass', words: [], score: 0, bingo: false });
}

/** Swapping needs a full rack's worth of tiles left in the bag, as in the boxed game. */
export const canSwap = (state: ScrabbleState) => state.bag.length >= RACK_SIZE;

export function swapTiles(state: ScrabbleState, letters: string[], rng: Rng): ScrabbleState {
  if (!canSwap(state) || !letters.length) return state;
  const player = state.turn;
  const rack = removeFromRack(state.racks[player], letters);
  const { drawn, bag } = draw(state.bag, letters.length);
  const racks: [string[], string[]] = [...state.racks];
  racks[player] = [...rack, ...drawn];
  const next = scoreless({ ...state, racks, bag: rng.shuffle([...bag, ...letters]) }, { player, kind: 'swap', words: [], score: 0, bingo: false, count: letters.length });
  return next;
}

export function shuffleRack(state: ScrabbleState, player: 0 | 1, rng: Rng): ScrabbleState {
  const racks: [string[], string[]] = [...state.racks];
  racks[player] = rng.shuffle(racks[player]);
  return { ...state, racks };
}

/** 0 or 1 for the leader, null for a draw. */
export function winner(state: ScrabbleState): 0 | 1 | null {
  if (state.scores[0] === state.scores[1]) return null;
  return state.scores[0] > state.scores[1] ? 0 : 1;
}

/** The latest move, for the hand-over curtain. */
export function lastMove(state: ScrabbleState): Move | undefined {
  return state.moves[state.moves.length - 1];
}
