import { describe, expect, it } from 'vitest';

import { LEVELS } from '../../harness/levels';
import { emptyTopics, migrateAuthored } from '../authoredMigration';

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
