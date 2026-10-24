// The line-by-line translation of a tutor answer, without React so it can be tested in Node.

import type { AppLang } from '@/i18n/languages';

export interface TranslatedAnswer {
  /** The text to show. */
  text: string;
  /** True when a translation exists for the source text. */
  available: boolean;
}

/** Translates one line of an answer between two languages. */
export type TranslateLine = (line: string, from: AppLang, to: AppLang) => Promise<string>;

/**
 * The translation of the finished lines of an answer. The failure of a line is thrown so the caller can say the
 * translation failed instead of quietly showing English.
 */
export async function translateLines(text: string, from: AppLang, to: AppLang, translate: TranslateLine): Promise<TranslatedAnswer> {
  const lines = text.split('\n');
  let available = false;
  const out: string[] = [];
  for (const line of lines) {
    const done = await translate(line, from, to);
    if (done !== line) available = true;
    out.push(done);
  }
  return { text: out.join('\n'), available };
}
