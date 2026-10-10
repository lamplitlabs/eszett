// The translator on this phone: which language pack is downloaded, and translating text through it.
//
// One pack at a time — the app language's — downloaded when the learner turns translation on and deleted when
// they turn it off or pick another language. Translations are cached by text so a re-rendered answer costs
// nothing; the cache lives for the session.

import { create } from 'zustand';

import type { AppLang } from '@/i18n/languages';

import { glossaryTerm } from './glossary';
import { isMtLang } from './languages';
import { translateMarkdown } from './markdown';
import { translator } from './native';

export type PackStatus =
  /** Translation is off, or the app language needs none. */
  | 'off'
  /** The language pack is being downloaded (about 30 MB). */
  | 'downloading'
  /** The pack is on the phone; the tutor's English is translated. */
  | 'ready'
  /** The download failed; `error` says why. */
  | 'error'
  /** The native module is missing (a build without it, or the web). */
  | 'unavailable';

interface TranslatorState {
  status: PackStatus;
  /** The language the status is about: the app language of the last sync. */
  lang: AppLang | null;
  error: string | null;
  /** Follows the settings: downloads the pack for `lang` when `on`, removes every pack otherwise. */
  sync: (lang: AppLang, on: boolean) => Promise<void>;
  /** Tries the download again after an error. */
  retry: () => Promise<void>;
}

let run = 0;

export const useTranslator = create<TranslatorState>()((set, get) => ({
  status: translator ? 'off' : 'unavailable',
  lang: null,
  error: null,
  sync: async (lang, on) => {
    const native = translator;
    const mine = ++run;
    const current = () => mine === run;
    if (!native) {
      set({ status: 'unavailable', lang });
      return;
    }
    const want = on && isMtLang(lang) ? lang : null;
    let have: string[] = [];
    try {
      have = await native.downloadedModels();
    } catch {
      have = [];
    }
    if (!current()) return;
    for (const tag of have) if (tag !== want && tag !== 'en') await native.deleteModel(tag).catch(() => undefined);
    if (!want) {
      if (current()) set({ status: 'off', lang, error: null });
      return;
    }
    if (have.includes(want)) {
      if (current()) set({ status: 'ready', lang, error: null });
      return;
    }
    set({ status: 'downloading', lang, error: null });
    try {
      await native.downloadModel(want, true);
      if (current()) set({ status: 'ready', error: null });
    } catch (e) {
      if (current()) set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
  retry: async () => {
    const { lang } = get();
    if (lang) await get().sync(lang, true);
  },
}));

/** True when the tutor's English should be shown translated into `lang` right now. */
export const translating = (lang: AppLang) => {
  const s = useTranslator.getState();
  return s.status === 'ready' && s.lang === lang;
};

const cache = new Map<string, Promise<string>>();
const CACHE_MAX = 600;

/** Translates a plain stretch of text; results are cached by text for the session. */
export function translateText(text: string, from: AppLang, to: AppLang): Promise<string> {
  if (!translator) return Promise.reject(new Error('translator unavailable'));
  if (from === to || !text.trim()) return Promise.resolve(text);
  const key = `${from}>${to}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = translator.translate(text, from, to);
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return p;
}

/** Translates a Markdown answer, leaving the German examples alone (see ./markdown). */
export const translateAnswer = (text: string, from: AppLang, to: AppLang) =>
  translateMarkdown(
    text,
    (s) => translateText(s, from, to),
    isMtLang(to) ? (term) => glossaryTerm(term, to) : undefined,
  );
