// How the authored store saved by an older build becomes today's shape. Pure TypeScript, so it is testable in node;
// src/state/authored.ts hands it to zustand's persist middleware.
import { LEVELS, type Level } from '../harness/levels';

export const emptyTopics = (): Record<Level, string[]> => {
  const topics = {} as Record<Level, string[]>;
  for (const level of LEVELS) topics[level] = [];
  return topics;
};

/**
 * Persisted topics from before a level was added (C1 came with version 1, C2 with version 2) have no slot for it; `persist`
 * shallow-merges the stored object over the defaults, so the slot stays missing. Fill the gaps, keep what was
 * there, and drop anything that is not a list of strings.
 */
export function migrateAuthored<T extends { topics?: unknown }>(persisted: unknown): Partial<T> & { topics: Record<Level, string[]> } {
  const state = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<T>;
  const stored = (state.topics ?? {}) as Partial<Record<Level, unknown>>;
  const topics = emptyTopics();
  for (const level of LEVELS) {
    const list = stored[level];
    if (Array.isArray(list)) topics[level] = list.filter((t): t is string => typeof t === 'string');
  }
  return { ...state, topics };
}
