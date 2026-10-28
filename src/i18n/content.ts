// Bundled content in the learner's language. The cards, scenes, rule sentences and the core lexicon ship with
// German and English fields; src/data/i18n/<lang>.json holds the other languages as overlays keyed by card key,
// scene key, rule kind or lemma. Anything missing falls back to English, so a partial overlay is still usable.
//
// The overlays are for what the learner *reads*. The objects the harness hands to the model keep their English
// fields: the model was trained on English labels, and its answers are parsed by them.
import { LEVEL_INFO_DE, type Level, type LevelInfo } from '@/harness/levels';
import type { PathUnit } from '@/harness/path';
import type { SceneCard } from '@/harness/roleplay';
import type { GrammarCard } from '@/harness/tutor';
import type { WriteTask } from '@/harness/writing';

import { getLanguage } from './index';
import type { AppLang } from './languages';
import { OVERLAYS } from './overlays';

export interface ContentOverlay {
  grammar?: Record<string, { title?: string; rule?: string; examples?: (string | null)[]; pitfalls?: (string | null)[] }>;
  scenes?: Record<string, { situation?: string; role?: string; learner?: string; facts?: (string | null)[]; opening?: string; beats?: (string | null)[] }>;
  /** Rule sentences by kind (the keys of src/data/rules.json). */
  rules?: Record<string, string>;
  /** Titles of the rule hits by kind (see TITLES in src/harness/rules.ts). */
  ruleTitles?: Record<string, string>;
  /** Core lexicon meanings by lemma (nouns) or infinitive (verbs). */
  lexicon?: Record<string, string>;
  levels?: Partial<Record<Level, { name?: string; canDo?: string; exampleGloss?: string }>>;
  /** Writing tasks by id: title, the task in the learner's language, the content points in order. */
  writing?: Record<string, { title?: string; prompt?: string; points?: (string | null)[] }>;
  /** Learning-path units by key: title, goal, and per step the question or situation it carries (null for the rest). */
  path?: Record<string, { title?: string; goal?: string; steps?: (string | null)[] }>;
}

const overlay = (lang: AppLang): ContentOverlay => OVERLAYS[lang] ?? {};

/** The displayed fields of a grammar card in `lang`: German fields for 'de', the overlay for other languages, English otherwise. */
export function localizeGrammar(card: GrammarCard, lang: AppLang = getLanguage()): GrammarCard {
  if (lang === 'en') return card;
  if (lang === 'de') {
    return { ...card, title_en: card.title_de, rule_en: card.rule_de, pitfalls: card.pitfalls.map((p) => ({ ...p, why_en: p.why_de })) };
  }
  const o = overlay(lang).grammar?.[card.key];
  if (!o) return card;
  return {
    ...card,
    title_en: o.title ?? card.title_en,
    rule_en: o.rule ?? card.rule_en,
    examples: card.examples.map(([de, en], i) => [de, o.examples?.[i] ?? en] as [string, string]),
    pitfalls: card.pitfalls.map((p, i) => ({ ...p, why_en: o.pitfalls?.[i] ?? p.why_en })),
  };
}

/** The displayed fields of a scene card in `lang`; the facts keep their German labels for the model. */
export function localizeScene(card: SceneCard, lang: AppLang = getLanguage()): SceneCard {
  if (lang === 'en') return card;
  if (lang === 'de') {
    return {
      ...card,
      situation_en: card.situation_de,
      role_en: card.role_de,
      learner_en: card.learner_de,
      facts: card.facts.map((f) => ({ ...f, label_en: f.label_de })),
    };
  }
  const o = overlay(lang).scenes?.[card.key];
  if (!o) return card;
  return {
    ...card,
    situation_en: o.situation ?? card.situation_en,
    role_en: o.role ?? card.role_en,
    learner_en: o.learner ?? card.learner_en,
    facts: card.facts.map((f, i) => ({ ...f, label_en: o.facts?.[i] ?? f.label_en })),
    opening_gloss: o.opening ?? card.opening_gloss,
    beats: card.beats.map((b, i) => ({ ...b, gloss: o.beats?.[i] ?? b.gloss })),
  };
}

/** A rule sentence by kind in `lang`, else the English/German one from rules.json, else null. */
export function ruleSentence(kind: string, texts: { de: string; en: string } | undefined, lang: AppLang = getLanguage()): string | null {
  if (!texts) return null;
  if (lang === 'de') return texts.de;
  return overlay(lang).rules?.[kind] ?? texts.en;
}

/** The title of a rule hit in `lang`. */
export function ruleTitle(kind: string, en: string, de: string, lang: AppLang = getLanguage()): string {
  if (lang === 'de') return de;
  return overlay(lang).ruleTitles?.[kind] ?? en;
}

/** The meaning of a core-lexicon word in `lang`; `fallback` is the English the lexicon ships with. */
export function wordMeaning(lemma: string, fallback: string, lang: AppLang = getLanguage()): string {
  if (lang === 'en') return fallback;
  return overlay(lang).lexicon?.[lemma] ?? fallback;
}

/** The level description in `lang`; in German the example needs no gloss. */
export function localizeLevel(info: LevelInfo, lang: AppLang = getLanguage()): LevelInfo {
  if (lang === 'en') return info;
  if (lang === 'de') return { ...info, ...LEVEL_INFO_DE[info.level], exampleGloss: '' };
  const o = overlay(lang).levels?.[info.level];
  if (!o) return info;
  return { ...info, name: o.name ?? info.name, canDo: o.canDo ?? info.canDo, exampleGloss: o.exampleGloss ?? info.exampleGloss };
}

/**
 * The displayed fields of a writing task in `lang`. The German task text ships with every task; the tutor's own
 * tasks have no German title or points and keep their English ones. `any` (what the pre-check looks for) is untouched.
 */
export function localizeWriting(task: WriteTask, lang: AppLang = getLanguage()): WriteTask {
  if (lang === 'en') return task;
  if (lang === 'de') {
    return { ...task, title: task.titleDe ?? task.title, prompt: task.promptDe, points: task.points.map((p) => ({ ...p, en: p.de ?? p.en })) };
  }
  const o = overlay(lang).writing?.[task.id];
  if (!o) return task;
  return {
    ...task,
    title: o.title ?? task.title,
    prompt: o.prompt ?? task.prompt,
    points: task.points.map((p, i) => ({ ...p, en: o.points?.[i] ?? p.en })),
  };
}

/**
 * The displayed fields of a learning-path unit in `lang`: title and goal, and the question or situation an
 * `ask` or `ownScene` step carries. As with the cards, `title_en` and the `_en` fields of the steps carry the
 * text in the app language; the German fields are what the German app shows.
 */
export function localizePathUnit(unit: PathUnit, lang: AppLang = getLanguage()): PathUnit {
  if (lang === 'en') return unit;
  if (lang === 'de') {
    return {
      ...unit,
      title_en: unit.title_de,
      goal_en: unit.goal_de,
      steps: unit.steps.map((s) => (s.kind === 'ask' ? { ...s, question_en: s.question_de } : s.kind === 'ownScene' ? { ...s, situation_en: s.situation_de } : s)),
    };
  }
  const o = overlay(lang).path?.[unit.key];
  if (!o) return unit;
  return {
    ...unit,
    title_en: o.title ?? unit.title_en,
    goal_en: o.goal ?? unit.goal_en,
    steps: unit.steps.map((s, i) => {
      const text = o.steps?.[i];
      if (!text) return s;
      if (s.kind === 'ask') return { ...s, question_en: text };
      if (s.kind === 'ownScene') return { ...s, situation_en: text };
      return s;
    }),
  };
}
