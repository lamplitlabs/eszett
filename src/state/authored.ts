// Content the tutor model wrote on this phone: role-play scenes, writing tasks and grammar cards the learner
// asked for, the reading texts of the course, and vocabulary topics the model suggested. Each item went through the harness parsers and the
// lexicon before it got here (see harness/authoring.ts); what the harness changed or could not confirm is kept
// with the item so the screen can say so. Bundled content stays in src/data; these sit next to it.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Level } from '@/harness/levels';
import type { ReadingDraft } from '@/harness/reading';
import type { SceneCard } from '@/harness/roleplay';
import type { GrammarCard } from '@/harness/tutor';
import type { AnswerChecks } from '@/harness/verify';
import type { WriteTask } from '@/harness/writing';

import { emptyTopics, migrateAuthored } from './authoredMigration';
import { storage } from './storage';

interface Authored {
  /** Written by the model, not shipped with the app. */
  generated: true;
  created: number;
}

export type AuthoredScene = SceneCard & Authored & { notes: string[]; warnings: string[] };
export type AuthoredTask = WriteTask & Authored & { topic: string };
export type AuthoredCard = GrammarCard & Authored & { topic: string; dropped: { example: [string, string]; why: string }[]; grounded: string[] };
/** A reading text with its questions, kept so the step opens again without a minute of writing. */
export type AuthoredReading = ReadingDraft & Authored & { level: Level; topic: string; checks: AnswerChecks };

/** How many reading texts are kept; the oldest go first. */
export const MAX_READINGS = 60;

export interface AuthoredState {
  scenes: Record<string, AuthoredScene>;
  tasks: Record<string, AuthoredTask>;
  cards: Record<string, AuthoredCard>;
  /** Reading texts by the step that asked for them (`unit:index`), or `level:topic` outside the course. */
  readings: Record<string, AuthoredReading>;
  /** Vocabulary topics the model suggested, per level, newest last. */
  topics: Record<Level, string[]>;
  addScene: (scene: AuthoredScene) => void;
  addTask: (task: AuthoredTask) => void;
  addCard: (card: AuthoredCard) => void;
  addReading: (key: string, reading: AuthoredReading) => void;
  addTopics: (level: Level, topics: string[]) => void;
  removeScene: (key: string) => void;
  removeTask: (id: string) => void;
  removeCard: (key: string) => void;
  removeReading: (key: string) => void;
}

const without = <T>(items: Record<string, T>, key: string) => {
  const next = { ...items };
  delete next[key];
  return next;
};

/** The newest `max` items by `created`; ties keep insertion order. */
export function newest<T extends { created: number }>(items: Record<string, T>, max: number): Record<string, T> {
  const keys = Object.keys(items);
  if (keys.length <= max) return items;
  const keep = keys
    .map((key, i) => ({ key, i, created: items[key].created }))
    .sort((a, b) => b.created - a.created || b.i - a.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i);
  return Object.fromEntries(keep.map(({ key }) => [key, items[key]]));
}

export const useAuthored = create<AuthoredState>()(
  persist(
    (set) => ({
      scenes: {},
      tasks: {},
      cards: {},
      readings: {},
      topics: emptyTopics(),
      addScene: (scene) => set((s) => ({ scenes: { ...s.scenes, [scene.key]: scene } })),
      addTask: (task) => set((s) => ({ tasks: { ...s.tasks, [task.id]: task } })),
      addCard: (card) => set((s) => ({ cards: { ...s.cards, [card.key]: card } })),
      addReading: (key, reading) => set((s) => ({ readings: newest({ ...without(s.readings, key), [key]: reading }, MAX_READINGS) })),
      addTopics: (level, topics) =>
        set((s) => {
          const current = s.topics[level] ?? [];
          const have = new Set(current.map((t) => t.toLowerCase()));
          const fresh = topics.filter((t) => !have.has(t.toLowerCase()));
          return fresh.length ? { topics: { ...s.topics, [level]: [...current, ...fresh] } } : s;
        }),
      removeScene: (key) => set((s) => ({ scenes: without(s.scenes, key) })),
      removeTask: (id) => set((s) => ({ tasks: without(s.tasks, id) })),
      removeCard: (key) => set((s) => ({ cards: without(s.cards, key) })),
      removeReading: (key) => set((s) => ({ readings: without(s.readings, key) })),
    }),
    { name: 'eszett.authored', storage, version: 2, migrate: (persisted) => migrateAuthored<AuthoredState>(persisted) as AuthoredState },
  ),
);

const NO_TOPICS: readonly string[] = Object.freeze([]);

/**
 * The topics the model suggested for a level; a shared empty list for a level nothing was suggested for yet
 * (a stable reference, so selectors built on it do not re-render on every store change).
 */
export const topicsFor = (s: Pick<AuthoredState, 'topics'>, level: Level): readonly string[] => s.topics[level] ?? NO_TOPICS;

/** Generated items, newest first. Pass the record a component subscribed to, so the list is derived from a stable reference. */
export const newestFirst = <T extends Authored>(items: Record<string, T>): T[] => Object.values(items).sort((a, b) => b.created - a.created);

export const authoredScenes = () => newestFirst(useAuthored.getState().scenes);
export const authoredTasks = () => newestFirst(useAuthored.getState().tasks);
export const authoredCards = () => newestFirst(useAuthored.getState().cards);

/** A bundled or generated scene by key. */
export const findScene = (bundled: SceneCard[], key: string | undefined): SceneCard | undefined =>
  (key && useAuthored.getState().scenes[key]) || bundled.find((s) => s.key === key);

export const findTask = (bundled: WriteTask[], id: string | undefined): WriteTask | undefined =>
  (id && useAuthored.getState().tasks[id]) || bundled.find((t) => t.id === id);

export const findCard = (bundled: GrammarCard[], key: string | undefined): GrammarCard | undefined =>
  (key && useAuthored.getState().cards[key]) || bundled.find((c) => c.key === key);
