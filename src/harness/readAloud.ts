// Reading aloud: the week's text, sentence by sentence, said into the phone's recognizer and compared with the
// text word by word (compareSpoken), with the pace of each sentence from the recognizer's timing. The score of
// a text is the share of words heard as written; the pace is words a minute, judged against the band a fluent
// reader keeps at the level (a learner reads slower than a speaker talks).

import { compareSpoken, spokenTokens, type SpokenComparison } from './speaking';

export interface ReadAloudSentence {
  text: string;
  /** Words that count (punctuation-only pieces do not). */
  words: number;
}

/** The text in sentences to read one at a time; a very short sentence joins the one before it. */
export function readAloudSentences(text: string): ReadAloudSentence[] {
  const parts = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…][“”"»)]?)\s+(?=[„"«(]?\p{Lu})/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: ReadAloudSentence[] = [];
  for (const p of parts) {
    const words = spokenTokens(p).length;
    const last = out[out.length - 1];
    if (last && (words < 3 || last.words < 3)) {
      last.text = `${last.text} ${p}`;
      last.words += words;
    } else out.push({ text: p, words });
  }
  return out;
}

export interface SentenceReading extends SpokenComparison {
  /** Words a minute over the turn, null when the turn was too short to measure. */
  wpm: number | null;
}

/** Compares one sentence as read; `ms` is how long the recognizer listened for it. */
export function scoreSentence(target: string, heard: string, ms: number): SentenceReading {
  const cmp = compareSpoken(target, heard);
  const said = spokenTokens(heard).length;
  const wpm = ms >= 1500 && said >= 2 ? Math.round((said / ms) * 60_000) : null;
  return { ...cmp, wpm };
}

export type Pace = 'slow' | 'steady' | 'fast';

/**
 * The pace a reading sits at. A learner reading a text aloud comfortably sits around 90–150 words a minute
 * (native read-aloud speech runs 150–180); under 70 means word-by-word decoding, over 170 is rushing.
 */
export function paceOf(wpm: number | null): Pace | null {
  if (wpm === null) return null;
  if (wpm < 80) return 'slow';
  if (wpm > 165) return 'fast';
  return 'steady';
}

export interface ReadingScore {
  /** Words heard as written over all words, 0..1. */
  accuracy: number;
  /** Mean of the measured sentences' words a minute, or null. */
  wpm: number | null;
  pace: Pace | null;
  /** Sentences in which every word was heard. */
  clean: number;
  total: number;
}

export function scoreReading(results: (SentenceReading | null)[], sentences: ReadAloudSentence[]): ReadingScore {
  let words = 0;
  let heard = 0;
  let clean = 0;
  const paces: number[] = [];
  results.forEach((r, i) => {
    const n = sentences[i]?.words ?? 0;
    words += n;
    if (!r) return;
    const ok = r.words.filter((w) => w.ok && spokenTokens(w.word).length > 0).length;
    heard += Math.min(ok, n);
    if (r.words.every((w) => w.ok)) clean += 1;
    if (r.wpm !== null) paces.push(r.wpm);
  });
  const wpm = paces.length ? Math.round(paces.reduce((a, b) => a + b, 0) / paces.length) : null;
  return { accuracy: words ? heard / words : 0, wpm, pace: paceOf(wpm), clean, total: sentences.length };
}

/** A reading counts as done when four words in five were heard as written. */
export const READ_ALOUD_PASS = 0.8;
