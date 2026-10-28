// The learning path as the screens show it: a step's title and detail in the app language, and its route with
// the texts the Tutor and Scenes tabs need. The model itself (src/harness/path.ts) stays pure.

import grammarData from '@/data/grammar.json';
import scenesData from '@/data/scenes.json';
import type { DrillCategory } from '@/harness/drills';
import { nextStep, type PathStep, type PathUnit, stepDone as isStepDone, stepHref } from '@/harness/path';
import { sceneTitle, type SceneCard } from '@/harness/roleplay';
import type { GrammarCard } from '@/harness/tutor';
import { WRITE_TASKS } from '@/harness/writing';
import { getLanguage, tIn } from '@/i18n';
import { localizeGrammar, localizePathUnit, localizeScene, localizeWriting } from '@/i18n/content';
import type { AppLang } from '@/i18n/languages';

import { wordTopicLabel } from './topics';

const grammar = grammarData as unknown as GrammarCard[];
const scenes = scenesData as unknown as SceneCard[];

const DRILL_TITLE: Record<DrillCategory, string> = {
  article: 'drill.titleArticle',
  plural: 'drill.titlePlural',
  meaning: 'drill.titleMeaning',
  verbs: 'drill.titleVerbs',
  numbers: 'drill.titleNumbers',
  clock: 'drill.titleClock',
  dates: 'drill.titleDates',
  prices: 'drill.titlePrices',
  ordinals: 'drill.titleOrdinals',
  sentence: 'drill.titleSentence',
};

export interface StepLabel {
  title: string;
  detail: string;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A step's title and detail in `lang`. */
export function stepLabel(unit: PathUnit, step: number, lang: AppLang = getLanguage()): StepLabel {
  const s = localizePathUnit(unit, lang).steps[step];
  switch (s.kind) {
    case 'words':
      return { title: tIn(lang, 'lesson.wordsTitle', { topic: wordTopicLabel(s.topic, lang) }), detail: tIn(lang, 'lesson.wordsDetail') };
    case 'grammar': {
      const card = grammar.find((c) => c.key === s.card);
      return { title: card ? localizeGrammar(card, lang).title_en : s.card, detail: tIn(lang, 'path.grammarDetail') };
    }
    case 'drill':
      return { title: tIn(lang, DRILL_TITLE[s.category]), detail: tIn(lang, 'path.drillDetail') };
    case 'scene': {
      const scene = scenes.find((c) => c.key === s.scene);
      if (!scene) return { title: s.scene, detail: '' };
      const shown = localizeScene(scene, lang);
      return { title: sceneTitle(shown), detail: tIn(lang, 'path.sceneDetail', { role: shown.role_en }) };
    }
    case 'ownScene':
      return { title: capitalize(s.situation_en), detail: tIn(lang, 'path.ownSceneDetail') };
    case 'write': {
      const task = WRITE_TASKS.find((t) => t.id === s.task);
      return task ? { title: localizeWriting(task, lang).title, detail: tIn(lang, 'lesson.writingDetail', { min: task.words[0], max: task.words[1] }) } : { title: s.task, detail: '' };
    }
    case 'ask':
      return { title: s.question_en, detail: tIn(lang, 'path.askDetail') };
    case 'read':
      return { title: tIn(lang, 'path.readTitle', { topic: wordTopicLabel(s.topic, lang) }), detail: tIn(lang, 'path.readDetail') };
    case 'check':
      return { title: tIn(lang, 'path.checkTitle'), detail: tIn(lang, 'path.checkDetail', { count: checkPitfalls(s.cards).length }) };
    case 'speak':
      return { title: tIn(lang, 'path.speakTitle', { count: speakSentences(s).length }), detail: tIn(lang, 'path.speakDetail') };
    case 'listen':
      return { title: tIn(lang, 'path.listenTitle', { count: listenSentences(s).length }), detail: tIn(lang, 'path.listenDetail') };
  }
}

export interface SpeakSentence {
  /** The German sentence to say. */
  text: string;
  /** Its gloss in English (a card's example) or null (a scene line; the scene's situation is the context). */
  gloss: string | null;
  /** Where it comes from: the scene or card key, and for a scene its situation in English. */
  source: { kind: 'scene'; key: string; situation: string } | { kind: 'card'; key: string };
}

const MAX_SPEAK = 8;
const MAX_LISTEN = 6;

/**
 * The sentences of the week's speaking step: the first line of each beat of the week's scenes (what the learner
 * says in the situation), then the grammar cards' example sentences, up to eight, in a fixed order.
 */
export function speakSentences(step: { scenes: string[]; cards: string[] }): SpeakSentence[] {
  const out: SpeakSentence[] = [];
  for (const key of step.scenes) {
    const scene = scenes.find((c) => c.key === key);
    if (!scene) continue;
    for (const beat of scene.beats) {
      const line = beat.learner[0];
      if (line) out.push({ text: line, gloss: null, source: { kind: 'scene', key, situation: scene.situation_en } });
    }
  }
  const sceneLines = out.length;
  for (const key of step.cards) {
    const card = grammar.find((c) => c.key === key);
    if (!card) continue;
    for (const [de, en] of card.examples) out.push({ text: de, gloss: en, source: { kind: 'card', key } });
  }
  // half the room for scene lines, the rest for examples, so neither crowds the other out
  const scenePart = out.slice(0, Math.min(sceneLines, MAX_SPEAK - Math.min(MAX_SPEAK / 2, out.length - sceneLines)));
  return [...scenePart, ...out.slice(sceneLines)].slice(0, MAX_SPEAK);
}

/**
 * The sentences of the week's dictation: what the other person says in the week's scenes (the opening line, then
 * each beat's reply, with its gloss), up to six; without a scene the grammar cards' examples, which a Sprechen step
 * has already read aloud.
 */
export function listenSentences(step: { scenes: string[]; cards: string[] }): SpeakSentence[] {
  const out: SpeakSentence[] = [];
  for (const key of step.scenes) {
    const scene = scenes.find((c) => c.key === key);
    if (!scene) continue;
    const source = { kind: 'scene' as const, key, situation: scene.situation_en };
    if (scene.opening) out.push({ text: scene.opening, gloss: scene.opening_gloss || null, source });
    for (const beat of scene.beats) if (beat.reply) out.push({ text: beat.reply, gloss: beat.gloss || null, source });
  }
  if (out.length < 3) {
    for (const key of step.cards) {
      const card = grammar.find((c) => c.key === key);
      if (!card) continue;
      for (const [de, en] of card.examples) out.push({ text: de, gloss: en, source: { kind: 'card', key } });
    }
  }
  return out.slice(0, MAX_LISTEN);
}

/** The sentences of the week's check: the typical mistakes of its grammar cards, in card order. */
export function checkPitfalls(cardKeys: string[]): { card: GrammarCard; index: number }[] {
  const out: { card: GrammarCard; index: number }[] = [];
  for (const key of cardKeys) {
    const card = grammar.find((c) => c.key === key);
    if (card) card.pitfalls.forEach((_, index) => out.push({ card, index }));
  }
  return out;
}

/** The next `n` unfinished steps of a unit: today's slice of the week (see src/features/lesson.ts). */
export function courseSlice(unit: PathUnit, done: Record<string, number>, n = 4): number[] {
  const out: number[] = [];
  for (let i = nextStep(unit, done) ?? unit.steps.length; i < unit.steps.length && out.length < n; i++) {
    if (!isStepDone(unit, i, done)) out.push(i);
  }
  return out;
}

/** The route of a step: the question or situation goes to the tutor in `explainIn`, the learner reads it in `lang`. */
export function stepRoute(unit: PathUnit, step: number, lang: AppLang, explainIn: AppLang): string {
  const s = unit.steps[step];
  if (s.kind !== 'ask' && s.kind !== 'ownScene') return stepHref(unit, step);
  const text = (x: PathStep) => (x.kind === 'ask' ? x.question_en : x.kind === 'ownScene' ? x.situation_en : '');
  const forTutor = text(localizePathUnit(unit, explainIn).steps[step]);
  const forLearner = text(localizePathUnit(unit, lang).steps[step]);
  // a scene is designed from an English description (the authoring prompts are English); the learner sees it in their language
  return stepHref(unit, step, { tutorText: s.kind === 'ownScene' ? s.situation_en : forTutor, shownText: forLearner });
}
