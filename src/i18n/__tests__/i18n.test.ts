import { afterEach, describe, expect, it } from 'vitest';

import { LEVEL_INFO } from '@/harness/levels';

import { CATALOGS } from '../catalogs';
import { localizeLevel } from '../content';
import { getLanguage, setLanguage, t, tIn } from '../index';
import { explainLangFor, isTutorLang, LANGUAGES, langOfLocale, pickDeviceLanguage, TUTOR_LANGUAGES, tutorLangFor } from '../languages';
import { pluralCategory } from '../plural';

const PLACEHOLDER = /\{(\w+)\}/g;
const placeholders = (s: string) => [...s.matchAll(PLACEHOLDER)].map((m) => m[1]).sort();

describe('plural rules', () => {
  it('English, German, Italian, Spanish: one and other', () => {
    for (const lang of ['en', 'de', 'it', 'es'] as const) {
      expect(pluralCategory(lang, 1)).toBe('one');
      expect(pluralCategory(lang, 0)).toBe('other');
      expect(pluralCategory(lang, 2)).toBe('other');
    }
  });
  it('French and Portuguese count zero as one', () => {
    expect(pluralCategory('fr', 0)).toBe('one');
    expect(pluralCategory('pt', 1)).toBe('one');
    expect(pluralCategory('fr', 2)).toBe('other');
  });
  it('Russian, Ukrainian and Polish: one, few, many', () => {
    for (const lang of ['ru', 'uk', 'pl'] as const) {
      expect(pluralCategory(lang, 1)).toBe('one');
      expect(pluralCategory(lang, 3)).toBe('few');
      expect(pluralCategory(lang, 5)).toBe('many');
      expect(pluralCategory(lang, 11)).toBe('many');
      expect(pluralCategory(lang, 22)).toBe('few');
    }
    expect(pluralCategory('ru', 21)).toBe('one');
    expect(pluralCategory('pl', 21)).toBe('many');
  });
  it('Arabic has zero, two and the 3-10 / 11-99 groups; Chinese does not inflect', () => {
    expect(pluralCategory('ar', 0)).toBe('zero');
    expect(pluralCategory('ar', 1)).toBe('one');
    expect(pluralCategory('ar', 2)).toBe('two');
    expect(pluralCategory('ar', 7)).toBe('few');
    expect(pluralCategory('ar', 15)).toBe('many');
    expect(pluralCategory('ar', 100)).toBe('other');
    expect(pluralCategory('zh', 1)).toBe('other');
    expect(pluralCategory('tr', 1)).toBe('one');
  });
});

describe('t()', () => {
  afterEach(() => {
    delete CATALOGS.en['test.hello'];
    delete CATALOGS.en['test.days'];
    delete CATALOGS.fr['test.hello'];
    delete CATALOGS.fr['test.days'];
    setLanguage('en');
  });

  it('fills placeholders and picks the plural form of the language', () => {
    CATALOGS.en['test.hello'] = 'Hello {name}';
    CATALOGS.en['test.days'] = { one: '{count} day', other: '{count} days' };
    CATALOGS.fr['test.days'] = { one: '{count} jour', other: '{count} jours' };
    expect(tIn('en', 'test.hello', { name: 'Mia' })).toBe('Hello Mia');
    expect(tIn('en', 'test.days', { count: 1 })).toBe('1 day');
    expect(tIn('en', 'test.days', { count: 4 })).toBe('4 days');
    expect(tIn('fr', 'test.days', { count: 0 })).toBe('0 jour');
    expect(tIn('fr', 'test.days', { count: 2 })).toBe('2 jours');
  });

  it('falls back to English, then to the key', () => {
    CATALOGS.en['test.hello'] = 'Hello';
    expect(tIn('pl', 'test.hello')).toBe('Hello');
    expect(tIn('pl', 'test.missing')).toBe('test.missing');
  });

  it('follows the current language', () => {
    CATALOGS.en['test.hello'] = 'Hello';
    CATALOGS.fr['test.hello'] = 'Bonjour';
    expect(getLanguage()).toBe('en');
    expect(t('test.hello')).toBe('Hello');
    setLanguage('fr');
    expect(t('test.hello')).toBe('Bonjour');
  });
});

describe('languages', () => {
  it('maps device locales to app languages', () => {
    expect(langOfLocale('pt-BR')).toBe('pt');
    expect(langOfLocale('zh-Hans-CN')).toBe('zh');
    expect(langOfLocale('ja-JP')).toBeNull();
    expect(pickDeviceLanguage(['ja-JP', 'uk-UA', 'en-US'])).toBe('uk');
    expect(pickDeviceLanguage(['ja-JP'])).toBe('en');
    expect(pickDeviceLanguage([])).toBe('en');
  });
  it('the tutor explains in the app language only where the model handles it', () => {
    expect(tutorLangFor('fr')).toBe('fr');
    expect(tutorLangFor('ru')).toBe('ru');
    expect(tutorLangFor('pl')).toBe('en');
    expect(tutorLangFor('ar', 'de')).toBe('de');
    for (const lang of TUTOR_LANGUAGES) expect(isTutorLang(lang)).toBe(true);
    expect(isTutorLang('pl')).toBe(false);
    expect(isTutorLang('uk')).toBe(false);
  });

  it('the app language is the one setting: explanations follow it, English where the model cannot, a pin wins', () => {
    expect(explainLangFor('de', null)).toBe('de');
    expect(explainLangFor('fr', null)).toBe('fr');
    // the phone showed English explanations under a German app: the pin from an earlier tap had held
    expect(explainLangFor('de', 'en')).toBe('en');
    expect(explainLangFor('pl', null)).toBe('en');
    expect(explainLangFor('pl', 'de')).toBe('de');
    expect(explainLangFor('ar', null)).toBe('en');
  });

  it('level names and can-do lines read in German when the app is German', () => {
    const de = localizeLevel(LEVEL_INFO.B2, 'de');
    expect(de.name).toBe('Obere Mittelstufe');
    expect(de.canDo).toMatch(/abstrakte Themen/);
    expect(de.example).toBe(LEVEL_INFO.B2.example);
    expect(de.exampleGloss).toBe('');
    expect(localizeLevel(LEVEL_INFO.A1, 'pl').name).toBe('Początkujący');
    expect(localizeLevel(LEVEL_INFO.A1, 'en')).toBe(LEVEL_INFO.A1);
  });
});

describe('catalogs', () => {
  it('every language has a catalog; English is the reference', () => {
    for (const lang of LANGUAGES) expect(CATALOGS[lang]).toBeTypeOf('object');
  });
  it('translated keys exist in English and keep its placeholders', () => {
    const en = CATALOGS.en;
    for (const lang of LANGUAGES) {
      if (lang === 'en') continue;
      for (const [key, entry] of Object.entries(CATALOGS[lang])) {
        expect(en[key], `${lang}: "${key}" is not an English key`).toBeDefined();
        const ref = en[key];
        const refText = typeof ref === 'string' ? ref : Object.values(ref ?? {}).join(' ');
        const text = typeof entry === 'string' ? entry : Object.values(entry ?? {}).join(' ');
        expect([...new Set(placeholders(text))], `${lang}: "${key}" placeholders`).toEqual([...new Set(placeholders(refText))]);
        if (typeof ref === 'object' && ref !== null) expect(typeof entry, `${lang}: "${key}" must be a plural object`).toBe('object');
      }
    }
  });
});
