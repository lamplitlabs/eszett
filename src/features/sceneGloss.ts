// Tap-to-translate of one scene line, testable in Node. A failed translation must never fall back to
// untranslated text silently: it throws so the screen can show a retryable error instead.
import type { AppLang } from '@/i18n/languages';
import { translateText } from '@/mt';

export interface GlossOptions {
  level: string;
  lang: AppLang;
}

/** Translates an English model gloss into the app language; throws when the translator fails. */
export async function glossInAppLanguage(gloss: string | null, via: AppLang | null): Promise<string | null> {
  if (!gloss || !via) return gloss;
  return translateText(gloss, 'en', via);
}

/** Fetches the gloss for a German line and moves it into the app language; throws on any failure. */
export async function fetchSceneGloss(
  german: string,
  opts: GlossOptions,
  fetchGloss: (german: string, opts: GlossOptions) => Promise<string | null>,
  via: AppLang | null,
): Promise<string | null> {
  const raw = await fetchGloss(german, opts);
  return glossInAppLanguage(raw, via);
}
