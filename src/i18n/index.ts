// The strings the app shows, in the learner's language. A catalog is a flat JSON object: `"me.title": "Me"`,
// `"me.days": { "one": "{count} day in a row", "other": "{count} days in a row" }`. `t()` looks a key up in the
// current language, then in English, then returns the key itself so a missing string is visible, not a crash.
//
// This module is pure (no Expo imports) so the harness tests can run it in node; src/i18n/bind.ts connects it to
// the saved settings and the device locale.
import { useSyncExternalStore } from 'react';

import { CATALOGS } from './catalogs';
import { isRtl, LANGUAGE_NAMES, type AppLang } from './languages';
import { pluralCategory, type PluralCategory } from './plural';

export type Vars = Record<string, string | number>;
export type CatalogEntry = string | Partial<Record<PluralCategory, string>>;
export type Catalog = Record<string, CatalogEntry>;

let current: AppLang = 'en';
const listeners = new Set<() => void>();
const warned = new Set<string>();

export function getLanguage(): AppLang {
  return current;
}

export function setLanguage(lang: AppLang): void {
  if (lang === current) return;
  current = lang;
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** True when a catalog with strings exists for the language (English is always complete). */
export const hasCatalog = (lang: AppLang) => lang === 'en' || Object.keys(CATALOGS[lang] ?? {}).length > 0;

function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

function pick(entry: CatalogEntry | undefined, lang: AppLang, vars?: Vars): string | null {
  if (entry === undefined) return null;
  if (typeof entry === 'string') return entry;
  const n = typeof vars?.count === 'number' ? vars.count : Number(vars?.count ?? NaN);
  const cat = Number.isNaN(n) ? 'other' : pluralCategory(lang, n);
  return entry[cat] ?? entry.other ?? entry.one ?? Object.values(entry)[0] ?? null;
}

/** The string for `key` in `lang`, with `{name}` placeholders filled from `vars`. */
export function tIn(lang: AppLang, key: string, vars?: Vars): string {
  const own = pick(CATALOGS[lang]?.[key], lang, vars);
  if (own !== null) return fill(own, vars);
  const en = pick(CATALOGS.en[key], 'en', vars);
  if (en !== null) return fill(en, vars);
  if (typeof __DEV__ !== 'undefined' && __DEV__ && !warned.has(key)) {
    warned.add(key);
    console.warn(`[i18n] missing string: ${key}`);
  }
  return key;
}

/** The string for `key` in the current language. */
export const t = (key: string, vars?: Vars): string => tIn(current, key, vars);

/** True when the current catalog has `key` itself (not only the English fallback). */
export const has = (key: string) => CATALOGS[current]?.[key] !== undefined;

/** Hook: re-renders when the language changes; returns `t` bound to it plus the language's facts. */
export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLanguage, getLanguage);
  return {
    lang,
    t: (key: string, vars?: Vars) => tIn(lang, key, vars),
    name: LANGUAGE_NAMES[lang],
    rtl: isRtl(lang),
  };
}
