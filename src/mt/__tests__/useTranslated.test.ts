import { describe, expect, it } from 'vitest';

import { translateLines } from '../translate';

/** A fake translator: wraps each line in the target language's marks. */
const fake = async (line: string) => `«${line}»`;
/** A translator that fails on every line, like a pack that cannot load. */
const broken = async (): Promise<string> => {
  throw new Error('pack unavailable');
};

describe('translateLines', () => {
  it('joins the translated lines and reports the translation available', async () => {
    await expect(translateLines('one\ntwo', 'en', 'de', fake)).resolves.toEqual({ text: '«one»\n«two»', available: true });
  });

  it('throws instead of falling back to the raw English when a line fails', async () => {
    await expect(translateLines('one\ntwo', 'en', 'de', broken)).rejects.toThrow('pack unavailable');
  });

  it('throws when any line fails, so no half-translated answer is shown', async () => {
    const flaky = async (line: string) => {
      if (line === 'two') throw new Error('pack unavailable');
      return `«${line}»`;
    };
    await expect(translateLines('one\ntwo\nthree', 'en', 'de', flaky)).rejects.toThrow('pack unavailable');
  });

  it('reports nothing translated when the translator hands every line back unchanged', async () => {
    const identity = async (line: string) => line;
    await expect(translateLines('one', 'en', 'de', identity)).resolves.toEqual({ text: 'one', available: false });
  });
});
