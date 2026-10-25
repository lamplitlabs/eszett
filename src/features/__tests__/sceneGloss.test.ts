// A failed scene-gloss translation must never fall back to the raw English silently: the helper throws so the
// screen shows a retryable error (i18n key scene.glossFailed) instead of untranslated text.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/mt', () => ({
  translateText: vi.fn(async (text: string, _from: string, _to: string) => `«${text}»`),
}));

import { translateText } from '@/mt';
import { fetchSceneGloss, glossInAppLanguage, type GlossOptions } from '../sceneGloss';

const opts: GlossOptions = { level: 'A1', lang: 'en' };

describe('glossInAppLanguage', () => {
  it('returns the gloss unchanged when there is nothing to translate', async () => {
    await expect(glossInAppLanguage(null, 'de')).resolves.toBeNull();
    await expect(glossInAppLanguage('der Hund', null)).resolves.toBe('der Hund');
  });

  it('moves the gloss into the app language through the translator', async () => {
    await expect(glossInAppLanguage('the dog', 'de')).resolves.toBe('«the dog»');
    expect(translateText).toHaveBeenCalledWith('the dog', 'en', 'de');
  });

  it('throws instead of falling back to the raw English when the translator fails', async () => {
    vi.mocked(translateText).mockRejectedValueOnce(new Error('pack unavailable'));
    await expect(glossInAppLanguage('the dog', 'de')).rejects.toThrow('pack unavailable');
  });
});

describe('fetchSceneGloss', () => {
  it('fetches the gloss and translates it into the app language', async () => {
    const fetchGloss = vi.fn(async (_g: string, _o: GlossOptions) => 'the dog');
    await expect(fetchSceneGloss('der Hund', opts, fetchGloss, 'de')).resolves.toBe('«the dog»');
    expect(fetchGloss).toHaveBeenCalledWith('der Hund', opts);
  });

  it('returns the English gloss unchanged when no bridge language is configured', async () => {
    const fetchGloss = vi.fn(async () => 'the dog');
    await expect(fetchSceneGloss('der Hund', opts, fetchGloss, null)).resolves.toBe('the dog');
  });

  it('propagates a tutor failure instead of showing untranslated text', async () => {
    const fetchGloss = vi.fn(async (): Promise<string | null> => {
      throw new Error('tutor unavailable');
    });
    await expect(fetchSceneGloss('der Hund', opts, fetchGloss, 'de')).rejects.toThrow('tutor unavailable');
  });

  it('propagates a translator failure instead of falling back to the raw English', async () => {
    vi.mocked(translateText).mockRejectedValueOnce(new Error('pack unavailable'));
    const fetchGloss = vi.fn(async () => 'the dog');
    await expect(fetchSceneGloss('der Hund', opts, fetchGloss, 'de')).rejects.toThrow('pack unavailable');
  });
});
