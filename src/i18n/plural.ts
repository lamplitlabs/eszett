// CLDR plural categories for the app's languages, written out rather than taken from Intl.PluralRules so the
// result is the same on Hermes, node and the web.
import type { AppLang } from './languages';

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export function pluralCategory(lang: AppLang, n: number): PluralCategory {
  const i = Math.abs(Math.trunc(n));
  const integer = Number.isInteger(n);
  switch (lang) {
    case 'fr':
    case 'pt':
      return i === 0 || i === 1 ? 'one' : 'other';
    case 'ru':
    case 'uk': {
      if (!integer) return 'other';
      const m10 = i % 10;
      const m100 = i % 100;
      if (m10 === 1 && m100 !== 11) return 'one';
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
      return 'many';
    }
    case 'pl': {
      if (!integer) return 'other';
      if (i === 1) return 'one';
      const m10 = i % 10;
      const m100 = i % 100;
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
      return 'many';
    }
    case 'ar': {
      if (!integer) return 'other';
      if (i === 0) return 'zero';
      if (i === 1) return 'one';
      if (i === 2) return 'two';
      const m100 = i % 100;
      if (m100 >= 3 && m100 <= 10) return 'few';
      if (m100 >= 11 && m100 <= 99) return 'many';
      return 'other';
    }
    case 'zh':
      return 'other';
    default:
      // en, de, es, it, tr
      return integer && i === 1 ? 'one' : 'other';
  }
}
