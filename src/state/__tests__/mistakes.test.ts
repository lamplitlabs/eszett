import { describe, expect, it, vi } from 'vitest';

import { CLEAR_AFTER, fixKey, MAX_MISTAKES, mistakesToReview, sayKey, useMistakes } from '../mistakes';
import { MAX_TEXTS, recentPointsRatio, textsNewestFirst, useTexts } from '../texts';

// an in-memory AsyncStorage so the persisted stores can be imported under node (vi.mock is hoisted above the imports)
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

describe('the mistakes notebook', () => {
  it('keys a sentence by its words and a pitfall by its card', () => {
    expect(sayKey('Wo warst du gestern? – Ich war krank.')).toBe(sayKey('wo warst du gestern ich war krank'));
    expect(fixKey('kein-nicht', 2)).toBe('fix:kein-nicht:2');
  });

  it('notes misses, counts them, and lets an item go after two right answers in a row', () => {
    const { miss, hit } = useMistakes.getState();
    miss({ key: fixKey('kein-nicht', 0), kind: 'fix', text: 'Ich habe nicht Zeit.', right: 'Ich habe keine Zeit.', card: 'kein-nicht', index: 0 });
    miss({ key: fixKey('kein-nicht', 0), kind: 'fix', text: 'Ich habe nicht Zeit.', right: 'Ich habe keine Zeit.', card: 'kein-nicht', index: 0 });
    expect(useMistakes.getState().items[fixKey('kein-nicht', 0)].misses).toBe(2);
    expect(CLEAR_AFTER).toBe(2);
    expect(hit(fixKey('kein-nicht', 0))).toBe(false);
    expect(useMistakes.getState().items[fixKey('kein-nicht', 0)].streak).toBe(1);
    // a miss in between resets the streak
    miss({ key: fixKey('kein-nicht', 0), kind: 'fix', text: 'Ich habe nicht Zeit.', right: 'Ich habe keine Zeit.', card: 'kein-nicht', index: 0 });
    expect(useMistakes.getState().items[fixKey('kein-nicht', 0)].streak).toBe(0);
    expect(hit(fixKey('kein-nicht', 0))).toBe(false);
    expect(hit(fixKey('kein-nicht', 0))).toBe(true);
    expect(useMistakes.getState().items[fixKey('kein-nicht', 0)]).toBeUndefined();
    expect(hit('fix:nothing:0')).toBe(false);
  });

  it('reviews the most recently missed first and never grows past the cap', () => {
    const { miss } = useMistakes.getState();
    for (let i = 0; i < MAX_MISTAKES + 10; i += 1) miss({ key: sayKey(`Satz ${i}`), kind: 'say', text: `Satz ${i}` });
    const items = useMistakes.getState().items;
    expect(Object.keys(items)).toHaveLength(MAX_MISTAKES);
    expect(items[sayKey('Satz 0')]).toBeUndefined();
    expect(mistakesToReview(items)[0].text).toBe(`Satz ${MAX_MISTAKES + 9}`);
  });
});

describe('the texts portfolio', () => {
  const sample = (hit: number, total = 3) => ({ taskId: 'a1-cafe-invite', title: 'A message to a friend', level: 'A1' as const, text: 'Hallo Lena …', words: 28, pointsHit: hit, pointsTotal: total, ok: hit === total, corrected: null, unchanged: true, explanation: '' });

  it('keeps texts newest first, with a recent points ratio, up to the cap', () => {
    const { add } = useTexts.getState();
    expect(recentPointsRatio({})).toBeNull();
    add(sample(1));
    add(sample(3));
    const items = useTexts.getState().items;
    expect(textsNewestFirst(items)[0].pointsHit).toBe(3);
    expect(recentPointsRatio(items)).toBeCloseTo(4 / 6);
    for (let i = 0; i < MAX_TEXTS + 5; i += 1) add(sample(2));
    expect(Object.keys(useTexts.getState().items)).toHaveLength(MAX_TEXTS);
  });
});
