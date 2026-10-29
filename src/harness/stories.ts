// The story pack: real German texts in the public domain - Grimm tales for A2 and B1, Hebel's calendar stories
// and Storm's Häwelmann for B2, Kafka and Hebel for C1, Kafka and Kleist for C2 - taken from Wikisource, their
// spelling lightly modernised (ß/ss, th/t, Thür/Tür) but their words left as written, and cut into parts of about
// two hundred words. Every part carries three comprehension questions and a list of old words with their
// modern meaning (src/data/stories.json). A part opens in the reading step (src/app/read.tsx) under the key
// `story:<id>:<part>`, so listening, exam-style listening and reading aloud work on it like on any text, and
// finishing its questions marks it done in the progress store under the same key.

import storiesData from '@/data/stories.json';

import type { Level } from './levels';
import { LEVELS } from './levels';
import type { ReadingDraft, ReadingQuestion } from './reading';
import type { AnswerChecks } from './verify';

export interface StoryGloss {
  word: string;
  meaning: string;
}

export interface StoryPart {
  text: string;
  questions: ReadingQuestion[];
  gloss: StoryGloss[];
}

export interface Story {
  id: string;
  title: string;
  author: string;
  level: Level;
  year: number | null;
  /** The edition the text follows, for the credit line. */
  edition: string;
  source: string;
  words: number;
  parts: StoryPart[];
}

export const STORIES: Story[] = storiesData as Story[];

/** A reading-step draft made from a story part, with empty checks (nothing was generated). */
export type StoryReading = ReadingDraft & { checks: AnswerChecks; level: Level; topic: string; story: Story; part: number };

const KEY = /^story:([a-z0-9-]+):(\d+)$/;

export const storyKey = (id: string, part: number): string => `story:${id}:${part}`;

export function parseStoryKey(key: string | undefined): { id: string; part: number } | null {
  const m = key ? KEY.exec(key) : null;
  return m ? { id: m[1], part: Number(m[2]) } : null;
}

export const storyById = (id: string): Story | undefined => STORIES.find((s) => s.id === id);

/** The words a reader at the level manages in a minute, for the "n min" line. */
const WORDS_PER_MINUTE = 110;

export const storyMinutes = (words: number): number => Math.max(1, Math.round(words / WORDS_PER_MINUTE));

/** The reading draft behind a story key, or null when the key is not a story part. */
export function storyReading(key: string | undefined): StoryReading | null {
  const ref = parseStoryKey(key);
  if (!ref) return null;
  const story = storyById(ref.id);
  const part = story?.parts[ref.part];
  if (!story || !part) return null;
  return {
    title: story.title,
    text: part.text,
    questions: part.questions,
    checks: { lexicon: null, quotes: [], engine: null, grounded: [] },
    level: story.level,
    topic: story.id,
    story,
    part: ref.part,
  };
}

/**
 * The stories to offer at a level: those set at it, and for A1, where nothing authentic exists, the A2 ones.
 * Every level up from the learner's has a few more waiting in the library.
 */
export function storiesFor(level: Level): Story[] {
  const own = STORIES.filter((s) => s.level === level);
  if (own.length) return own;
  const next = LEVELS.slice(LEVELS.indexOf(level) + 1).find((l) => STORIES.some((s) => s.level === l));
  return next ? STORIES.filter((s) => s.level === next) : [];
}

/** How many parts of the story are done, and the first one that is not. */
export function storyProgress(story: Story, done: Record<string, number>): { done: number; next: number | null } {
  let count = 0;
  let next: number | null = null;
  story.parts.forEach((_, i) => {
    if (done[storyKey(story.id, i)]) count += 1;
    else if (next === null) next = i;
  });
  return { done: count, next };
}
