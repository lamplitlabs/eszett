// Speaking: what the recognizer heard against the sentence the learner was to say, word by word. The two are
// normalised the way the drills compare answers (case, ß and umlauts, punctuation), digits the recognizer writes
// become the German number words, and the words are aligned by their longest common subsequence, so a missed or
// garbled word shows up in place without throwing the rest of the sentence off.

import { normalise, numberToGerman } from './engines';

export interface SpokenWord {
  /** The word as it stands in the target sentence. */
  word: string;
  /** Heard as said. */
  ok: boolean;
}

export interface SpokenComparison {
  words: SpokenWord[];
  /** Words heard over words in the target, 0..1. */
  ratio: number;
  /** Good enough to count: four words in five. */
  clear: boolean;
}

export const CLEAR_RATIO = 0.8;

/** "um 7 Uhr" -> "um sieben uhr": the recognizer writes numbers as digits, the sentences spell them. */
export function spokenTokens(text: string): string[] {
  return normalise(text)
    .replace(/(\d+)[.,](\d+)/g, '$1 komma $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((tok) => (/^\d+$/.test(tok) && Number(tok) <= 1_000_000 ? normalise(numberToGerman(Number(tok))).split(/[^a-z0-9]+/).filter(Boolean) : [tok]));
}

/** The target's words that also occur in the heard words, in order (longest common subsequence). */
function matched(target: string[], heard: string[]): boolean[] {
  const n = target.length;
  const m = heard.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = target[i] === heard[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ok = new Array<boolean>(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (target[i] === heard[j]) {
      ok[i] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return ok;
}

/** Splits the target into display words (with their punctuation) and the tokens each one compares by. */
function targetWords(target: string): { word: string; tokens: string[] }[] {
  return target
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({ word, tokens: spokenTokens(word) }));
}

export function compareSpoken(target: string, heard: string): SpokenComparison {
  const words = targetWords(target);
  const flat = words.flatMap((w) => w.tokens);
  const ok = matched(flat, spokenTokens(heard));
  let k = 0;
  const out: SpokenWord[] = words.map((w) => {
    // a display word counts as heard when every token it compares by was heard ("7" -> "sieben")
    const mine = ok.slice(k, k + w.tokens.length);
    k += w.tokens.length;
    return { word: w.word, ok: w.tokens.length === 0 || mine.every(Boolean) };
  });
  const scored = out.filter((w) => spokenTokens(w.word).length > 0);
  const hit = scored.filter((w) => w.ok).length;
  const ratio = scored.length ? hit / scored.length : 0;
  return { words: out, ratio, clear: scored.length > 0 && ratio >= CLEAR_RATIO };
}
