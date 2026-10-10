// The languages the app speaks. Two different lists live here: the languages the *app* (menus, cards, rule
// sentences) can be shown in, and the languages the *tutor model* answers in well enough to use. v23 was
// probed in twelve languages (files/model-wishlist.md §13): it explains German reliably in English, German,
// French, Spanish, Italian, Portuguese and Chinese, and in Russian when the question itself is in Russian
// (the app's prompts are, see src/harness/promptTexts.ts); in Polish, Ukrainian, Turkish, Arabic, Hindi and
// Persian it produces word salad, so learners of those languages see the app in their language and get the
// tutor's explanations in English until a model trained on multilingual data ships. The app language is the one
// setting: `explainLangFor` derives the tutor's language from it, and the Me screen's "Explanations in" is an
// override ("Same as the app" by default, pinned until the app language changes) that lists every app language
// and greys out the ones the model cannot speak.

/** Every language the app knows about; a catalog may be missing, in which case English is shown. */
export const LANGUAGES = ['en', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'ru', 'uk', 'tr', 'ar', 'zh'] as const;
export type AppLang = (typeof LANGUAGES)[number];

/** Languages the on-device model explains German in well enough (probe of v23, 7 Oct). */
export const TUTOR_LANGUAGES = ['en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh'] as const satisfies readonly AppLang[];
export type TutorLang = (typeof TUTOR_LANGUAGES)[number];

/** The language's own name, as shown in the picker. */
export const LANGUAGE_NAMES: Record<AppLang, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  pl: 'Polski',
  ru: 'Русский',
  uk: 'Українська',
  tr: 'Türkçe',
  ar: 'العربية',
  zh: '中文',
};

/** The language's name in English, for the tutor prompts and logs. */
export const LANGUAGE_NAMES_EN: Record<AppLang, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  pl: 'Polish',
  ru: 'Russian',
  uk: 'Ukrainian',
  tr: 'Turkish',
  ar: 'Arabic',
  zh: 'Chinese',
};

const RTL = new Set<AppLang>(['ar']);

export const isAppLang = (x: unknown): x is AppLang => typeof x === 'string' && (LANGUAGES as readonly string[]).includes(x);
export const isTutorLang = (x: unknown): x is TutorLang => typeof x === 'string' && (TUTOR_LANGUAGES as readonly string[]).includes(x);
export const isRtl = (lang: AppLang) => RTL.has(lang);

/** 'pt-BR' -> 'pt', 'zh-Hans-CN' -> 'zh', 'nb' -> null: the app language a device locale tag maps to. */
export function langOfLocale(tag: string | null | undefined): AppLang | null {
  if (!tag) return null;
  const code = tag.toLowerCase().split(/[-_]/)[0];
  return isAppLang(code) ? code : null;
}

/** The first device locale the app has a language for, else English. */
export function pickDeviceLanguage(tags: readonly (string | null | undefined)[]): AppLang {
  for (const tag of tags) {
    const lang = langOfLocale(tag);
    if (lang) return lang;
  }
  return 'en';
}

/**
 * The language the tutor should explain in for an app language: the same language when the model handles it,
 * otherwise the fallback the learner chose (English by default).
 */
export function tutorLangFor(app: AppLang, fallback: TutorLang = 'en'): TutorLang {
  return isTutorLang(app) ? app : fallback;
}

/**
 * The language the tutor explains in for the saved settings. The app language is the one setting: the tutor
 * follows it when the model handles it and falls back to English otherwise. A learner who picked another
 * language under "Explanations in" (pinned) keeps it until the app language changes.
 */
export function explainLangFor(app: AppLang, pinned: TutorLang | null): TutorLang {
  return pinned ?? tutorLangFor(app, 'en');
}
