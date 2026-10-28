import { describe, expect, it, vi } from 'vitest';

import { LEVELS } from '../../harness/levels';
import { MAX_READINGS, newest, useAuthored } from '../authored';
import { emptyTopics, migrateAuthored } from '../authoredMigration';

// an in-memory AsyncStorage so the persisted store can be imported under node (vi.mock is hoisted above the imports)
vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});

describe('authored migration', () => {
  it('gives every level a topic slot, including C1 (new in version 1) and C2 (new in version 2)', () => {
    const migrated = migrateAuthored<{ scenes: Record<string, number>; topics?: unknown }>({ scenes: { a: 1 }, topics: { A1: ['Essen'], B2: ['Politik', 7, null], C1: ['Presse'] } });
    expect(Object.keys(migrated.topics).sort()).toEqual([...LEVELS].sort());
    expect(migrated.topics.A1).toEqual(['Essen']);
    expect(migrated.topics.B2).toEqual(['Politik']);
    expect(migrated.topics.C1).toEqual(['Presse']);
    expect(migrated.topics.C2).toEqual([]);
    expect(migrated.scenes).toEqual({ a: 1 });
  });
  it('copes with nothing stored at all', () => {
    expect(migrateAuthored(undefined).topics).toEqual(emptyTopics());
    expect(migrateAuthored({ topics: 'junk' }).topics).toEqual(emptyTopics());
    expect(migrateAuthored(null).topics.C2).toEqual([]);
  });
});

describe('kept reading texts', () => {
  const reading = (created: number) => ({ title: 't', text: 'Ein Text.', questions: [], checks: { lexicon: null, quotes: [], engine: null, grounded: [] }, level: 'A1' as const, topic: 'the family', generated: true as const, created });

  it('keeps the newest texts and drops the oldest past the cap', () => {
    const items = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`k${i}`, { created: i }]));
    expect(Object.keys(newest(items, 3))).toEqual(['k2', 'k3', 'k4']);
    expect(newest(items, 5)).toBe(items);
  });

  it('stores a text by its step, replaces it on the next text, and never grows past the cap', () => {
    const { addReading, removeReading } = useAuthored.getState();
    addReading('a1-01:4', reading(1));
    addReading('a1-01:4', reading(2));
    expect(useAuthored.getState().readings['a1-01:4']?.created).toBe(2);
    for (let i = 0; i < MAX_READINGS + 5; i += 1) addReading(`A1:topic ${i}`, reading(10 + i));
    const keys = Object.keys(useAuthored.getState().readings);
    expect(keys).toHaveLength(MAX_READINGS);
    expect(keys).not.toContain('a1-01:4');
    expect(keys).toContain(`A1:topic ${MAX_READINGS + 4}`);
    removeReading(`A1:topic ${MAX_READINGS + 4}`);
    expect(useAuthored.getState().readings[`A1:topic ${MAX_READINGS + 4}`]).toBeUndefined();
  });
});
