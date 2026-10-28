// Reading and listening: the tutor writes a short German text on a topic at the learner's level, with three
// multiple-choice comprehension questions. The app reads the draft by shape (title, text, numbered questions with
// three options and an answer letter), so the questions are checked by code, never by the model; a draft that
// does not have the shape is asked for again in other words (src/harness/tutor.ts readingText).

import type { Level } from './levels';
import { wordCount } from './route';

export interface ReadingQuestion {
  question: string;
  options: string[];
  /** The index of the right option in `options`. */
  answer: number;
}

export interface ReadingDraft {
  title: string;
  /** The text, paragraphs separated by a blank line. */
  text: string;
  questions: ReadingQuestion[];
}

/** The length of the text per level, in words: the Goethe Lesen parts run from short notices to a column. */
export const READING_WORDS: Record<Level, [number, number]> = {
  A1: [50, 80],
  A2: [80, 120],
  B1: [120, 160],
  B2: [160, 210],
  C1: [190, 240],
  C2: [210, 260],
};

export const READING_QUESTIONS = 3;

/** How many tokens the draft may take: the text at the level's length plus the three questions. */
export function readingBudget(level: Level): number {
  const words = READING_WORDS[level][1];
  // German runs at roughly 1.7 tokens a word on this tokenizer; the questions and labels take about 160 more
  return Math.round(words * 1.7) + 160;
}

const QUESTION_LINE = /^(?:frage|question|q)\s*(\d)\s*[:.)-]\s*(.+)$/i;
const OPTION_LINE = /^\(?([a-cA-C])[).:\]-]\s*(.+)$/;
const ANSWER_LINE = /^(?:antwort|answer|lösung|loesung|richtig|correct)\s*[:.-]?\s*\(?([a-cA-C])\)?\b/i;
const TITLE_LINE = /^(?:titel|title|überschrift|ueberschrift)\s*:\s*(.+)$/i;
const LABEL_LINE = /^(?:text|lesetext|reading|fragen|questions|verständnisfragen|verstaendnisfragen|aufgaben)\s*:?\s*$/i;

const stripMd = (s: string) =>
  s
    .replace(/^\s*[-*•]\s+/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#+\s*/, '')
    .trim();

/**
 * Reads a draft: `Titel: …`, the text (paragraphs), then `Frage 1: …` with options a) b) c) and `Antwort: b)`,
 * three times. Null when fewer than two questions are complete or the text is far too short for the level.
 */
export function parseReadingDraft(raw: string, level: Level): ReadingDraft | null {
  const lines = raw.split(/\r?\n/).map(stripMd);
  let title = '';
  const textLines: string[] = [];
  const questions: ReadingQuestion[] = [];
  let current: { question: string; options: string[]; answer: number | null } | null = null;

  const closeQuestion = () => {
    if (current && current.options.length >= 2 && current.answer !== null && current.answer < current.options.length) {
      questions.push({ question: current.question, options: current.options, answer: current.answer });
    }
    current = null;
  };

  for (const line of lines) {
    if (!line) {
      if (!current) textLines.push('');
      continue;
    }
    const t = TITLE_LINE.exec(line);
    if (t && !title && !current) {
      title = t[1].replace(/^["„“]|["“”]$/g, '').trim();
      continue;
    }
    if (LABEL_LINE.test(line)) continue;
    const q = QUESTION_LINE.exec(line);
    if (q) {
      closeQuestion();
      current = { question: q[2].trim(), options: [], answer: null };
      continue;
    }
    if (current) {
      const a = ANSWER_LINE.exec(line);
      if (a) {
        current.answer = a[1].toLowerCase().charCodeAt(0) - 97;
        continue;
      }
      const o = OPTION_LINE.exec(line);
      if (o) {
        const idx = o[1].toLowerCase().charCodeAt(0) - 97;
        if (idx === current.options.length) current.options.push(o[2].trim());
        continue;
      }
      // a question's continuation line before its options
      if (!current.options.length) current.question = `${current.question} ${line}`.trim();
      continue;
    }
    textLines.push(line);
  }
  closeQuestion();

  const text = textLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const [lo] = READING_WORDS[level];
  if (wordCount(text) < lo * 0.6) return null;
  if (questions.length < 2) return null;
  const clean = questions.slice(0, READING_QUESTIONS).map((qq) => ({ ...qq, options: qq.options.slice(0, 3) })).filter((qq) => qq.answer < qq.options.length);
  if (clean.length < 2) return null;
  // without a "Titel:" line, a short first line that is not a sentence is the title
  if (!title) {
    const [first, ...rest] = text.split('\n');
    if (first.length <= 60 && !/[.!?]$/.test(first) && rest.join('\n').trim()) {
      return { title: first.trim(), text: rest.join('\n').trim(), questions: clean };
    }
  }
  return { title, text, questions: clean };
}

/** Generation can stop once the third question has its answer line. */
export function readingComplete(full: string): boolean {
  const answers = full.match(/^(?:antwort|answer|lösung|loesung)\s*[:.-]?\s*\(?[a-cA-C]\)?/gim) ?? [];
  return answers.length >= READING_QUESTIONS;
}

/** How many words of the text itself a draft holds so far: the title line, labels and the questions do not count. */
export function readingWordsSoFar(full: string): number {
  let n = 0;
  for (const line of full.split(/\r?\n/).map(stripMd)) {
    if (!line) continue;
    if (QUESTION_LINE.test(line)) break;
    if (TITLE_LINE.test(line) || LABEL_LINE.test(line)) continue;
    n += wordCount(line);
  }
  return n;
}
