// Keeping the German in a learner's question away from the translator.
//
// A Polish learner asks "Co to znaczy trotzdem?"; the Polish goes to English for the tutor, but the German word
// must arrive untouched (ML Kit turned it into "TROTZZZTE" on the phone, and the tutor explained a word that does
// not exist). German is spotted word by word — the word lists, German letters, a capitalised noun right after a
// German word, a quoted stretch that reads as German — and in a Cyrillic or Arabic question every Latin word is
// German. Adjoining German words become one placeholder; the question is translated around them and the German
// put back. Pure functions, tested in Node with a fake translator.

import { knownGermanWord, looksGerman } from '@/harness/german';
import type { AppLang } from '@/i18n/languages';

import { placeholder, unmask, type Masked, type Translate } from './markdown';

/** Languages written in another script: a Latin-letter word in their question is German (or English, equally kept). */
const NON_LATIN: ReadonlySet<AppLang> = new Set<AppLang>(['uk', 'ar', 'ru', 'zh']);

const LATIN = /[A-Za-zÄÖÜäöüß]/;
/** Letters German has and Polish or Turkish do not (Turkish shares ö and ü). */
const GERMAN_LETTERS = /[äÄß]/;
const UMLAUTS = /[öüÖÜ]/;
/** German words that are also everyday words of the question's language: Polish "nie", Turkish "bin" (a thousand). */
const NOT_GERMAN_IN: Partial<Record<AppLang, ReadonlySet<string>>> = { pl: new Set(['nie', 'mit', 'bis']), tr: new Set(['bin', 'an', 'hat', 'mit']) };
const WORD = /[\p{L}][\p{L}'’-]*/gu;
/** A quoted stretch: „…“, «…», "…", '…' */
const QUOTED = /„([^“”"]+)[“”"]|«([^»]+)»|"([^"]+)"|(?<!\p{L})'([^']+)'(?!\p{L})/gu;

function germanWord(word: string, app: AppLang): boolean {
  if (!LATIN.test(word)) return false;
  if (NON_LATIN.has(app)) return true;
  if (GERMAN_LETTERS.test(word)) return true;
  if (NOT_GERMAN_IN[app]?.has(word.toLowerCase())) return false;
  if (UMLAUTS.test(word)) return app !== 'tr' || knownGermanWord(word);
  return looksGerman(word);
}

const germanQuote = (inner: string, app: AppLang) => (NON_LATIN.has(app) ? LATIN.test(inner) : GERMAN_LETTERS.test(inner) || looksGerman(inner));

export interface MaskedQuestion {
  text: string;
  spans: Masked[];
}

/** Swaps the German in a question for placeholders; null when there is none. */
export function maskQuestion(text: string, app: AppLang): MaskedQuestion | null {
  const spans: Masked[] = [];
  const keep = (s: string) => {
    spans.push({ text: s });
    return placeholder(spans.length);
  };
  // quoted German first, as a whole
  const quoted = text.replace(QUOTED, (m, a, b, c, d) => (germanQuote(a ?? b ?? c ?? d, app) ? keep(m) : m));
  // then word by word; adjoining German words (only spaces between) form one span, and a capitalised word right
  // after German is its noun ("der Hund", "zur Arbeit")
  const runs: { start: number; end: number }[] = [];
  for (const m of quoted.matchAll(WORD)) {
    const word = m[0];
    const start = m.index ?? 0;
    const last = runs[runs.length - 1];
    const adjoining = last !== undefined && /^\s+$/.test(quoted.slice(last.end, start));
    const german = germanWord(word, app) || (adjoining && /^[A-ZÄÖÜ][a-zäöüß]+$/.test(word));
    if (!german) continue;
    if (adjoining) last.end = start + word.length;
    else runs.push({ start, end: start + word.length });
  }
  let out = '';
  let pos = 0;
  for (const r of runs) {
    out += quoted.slice(pos, r.start) + keep(quoted.slice(r.start, r.end));
    pos = r.end;
  }
  out += quoted.slice(pos);
  return spans.length ? { text: out, spans } : null;
}

/**
 * Translates a learner's question into English for the tutor with its German kept verbatim. When the translator
 * loses a placeholder the whole question is translated and checked for the German; when that fails too the
 * question goes as the learner typed it.
 */
export async function translateQuestion(text: string, app: AppLang, translate: Translate): Promise<string> {
  const masked = maskQuestion(text, app);
  if (!masked) return translate(text);
  const first = unmask(await translate(masked.text), masked.spans);
  if (first !== null) return first;
  const whole = await translate(text);
  return masked.spans.every((s) => whole.includes(s.text)) ? whole : text;
}
