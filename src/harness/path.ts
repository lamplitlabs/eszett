// The learning path: a course for each level, week by week, built from material the app already has. A unit is
// one week: a can-do goal and an ordered list of steps grouped by skill in the rhythm a course book keeps -
// vocabulary, grammar, practice, questions for the tutor, reading and listening, speaking, writing, and a check
// at the end. Every step opens a screen (a word list, a grammar card, a drill, a question for the tutor, a text
// the tutor writes, a scene, a writing task, the week's check) with a `path` parameter, and the screen marks the
// step done the way it marks the daily lesson's activities. The units follow the topic and grammar progression
// of the Goethe-Institut exam syllabi (A1-C2), the BAMF framework curriculum (A1-B1) and the common course books
// (Menschen, Netzwerk, Schritte, Aspekte, Sicher!, Erkundungen); see README "The learning path".
//
// This module is pure (no model, no Expo): the screens read it, and the tests check that every step points at
// something the app ships.

import pathData from '@/data/path.json';

import type { DrillCategory } from './drills';
import type { Level } from './levels';

export type PathStep =
  | { kind: 'words'; topic: string }
  | { kind: 'grammar'; card: string }
  | { kind: 'drill'; category: DrillCategory }
  | { kind: 'scene'; scene: string }
  /** The tutor writes a scene for this situation on the phone (the Scenes tab's own-scene box, prefilled). */
  | { kind: 'ownScene'; situation_en: string; situation_de: string }
  | { kind: 'write'; task: string }
  /** A question for the Tutor tab, prefilled in the composer. */
  | { kind: 'ask'; question_en: string; question_de: string }
  /** Reading and listening: the tutor writes a short text on the topic at the level, with comprehension questions. */
  | { kind: 'read'; topic: string }
  /** The week's check: the typical mistakes of these grammar cards, to fix one by one. */
  | { kind: 'check'; cards: string[] };

export type PathStepKind = PathStep['kind'];

/** The skills a week's steps are grouped by, in the order the week runs. */
export type Skill = 'words' | 'grammar' | 'drill' | 'ask' | 'read' | 'speak' | 'write' | 'check';
export const SKILLS: Skill[] = ['words', 'grammar', 'drill', 'ask', 'read', 'speak', 'write', 'check'];

export const stepSkill = (step: PathStep): Skill => (step.kind === 'scene' || step.kind === 'ownScene' ? 'speak' : step.kind);

/** The steps of a unit grouped by skill, in week order, each with its index in the unit (the progress key). */
export function stepsBySkill(unit: PathUnit): { skill: Skill; steps: { index: number; step: PathStep }[] }[] {
  const groups: { skill: Skill; steps: { index: number; step: PathStep }[] }[] = [];
  unit.steps.forEach((step, index) => {
    const skill = stepSkill(step);
    const last = groups[groups.length - 1];
    if (last && last.skill === skill) last.steps.push({ index, step });
    else groups.push({ skill, steps: [{ index, step }] });
  });
  return groups;
}

/** The index of the unit in its level, 1-based: its week number. */
export const weekNumber = (unit: PathUnit) => unitsFor(unit.level).findIndex((u) => u.key === unit.key) + 1;

export interface PathUnit {
  /** `a1-03`: the level and the unit's number; stable, it keys progress and the content overlays. */
  key: string;
  level: Level;
  title_de: string;
  title_en: string;
  /** The can-do goal, one or two sentences. */
  goal_de: string;
  goal_en: string;
  steps: PathStep[];
}

export const PATH_UNITS: PathUnit[] = pathData as unknown as PathUnit[];

export const unitsFor = (level: Level): PathUnit[] => PATH_UNITS.filter((u) => u.level === level);

export const unitByKey = (key: string | undefined): PathUnit | undefined => PATH_UNITS.find((u) => u.key === key);

/** The `path` route parameter of a step: unit key and step index. */
export const pathParam = (unit: string, step: number) => `${unit}:${step}`;

/** The progress key a screen writes when a step is finished (`markDone(pathDoneKey(params.path))`). */
export const pathDoneKey = (param: string) => `path:${param}`;

/** What `pathParam` wrote, read back; null for anything else. */
export function parsePathParam(param: string | undefined): { unit: string; step: number } | null {
  const m = /^([a-z]\d-\d{2}):(\d+)$/.exec(param ?? '');
  return m ? { unit: m[1], step: Number(m[2]) } : null;
}

/**
 * A step counts as done when it was finished from the path, or when the card, scene or task it points at was
 * finished on its own (a learner who already read a card should not have to read it again).
 */
export function stepDone(unit: PathUnit, step: number, done: Record<string, number>): boolean {
  if (done[pathDoneKey(pathParam(unit.key, step))]) return true;
  const s = unit.steps[step];
  if (!s) return false;
  if (s.kind === 'grammar') return Boolean(done[`grammar:${s.card}`]);
  if (s.kind === 'scene') return Boolean(done[`scene:${s.scene}`]);
  if (s.kind === 'write') return Boolean(done[`write:${s.task}`]);
  return false;
}

export const unitDone = (unit: PathUnit, done: Record<string, number>) => unit.steps.every((_, i) => stepDone(unit, i, done));

/** Steps finished in a unit. */
export const unitFinishedCount = (unit: PathUnit, done: Record<string, number>) => unit.steps.filter((_, i) => stepDone(unit, i, done)).length;

/** The first unfinished step of a unit, or null when the unit is done. */
export function nextStep(unit: PathUnit, done: Record<string, number>): number | null {
  const i = unit.steps.findIndex((_, k) => !stepDone(unit, k, done));
  return i === -1 ? null : i;
}

export interface LevelProgress {
  units: PathUnit[];
  finished: number;
  /** The first unit with an unfinished step; null when the level is complete (or has no units). */
  current: PathUnit | null;
  /** Finished steps over all steps, 0..1. */
  ratio: number;
}

export function levelProgress(level: Level, done: Record<string, number>): LevelProgress {
  const units = unitsFor(level);
  const finished = units.filter((u) => unitDone(u, done)).length;
  const current = units.find((u) => !unitDone(u, done)) ?? null;
  const total = units.reduce((n, u) => n + u.steps.length, 0);
  const steps = units.reduce((n, u) => n + unitFinishedCount(u, done), 0);
  return { units, finished, current, ratio: total ? steps / total : 0 };
}

export interface StepRoute {
  /** The question (ask) or situation (ownScene) in the tutor's language; the texts the step itself carries otherwise. */
  tutorText?: string;
  /** The same in the app language, for the learner's bubble. */
  shownText?: string;
}

/** The route a step opens, carrying the `path` parameter that marks it done. */
export function stepHref(unit: PathUnit, step: number, texts: StepRoute = {}): string {
  const s = unit.steps[step];
  const p = `path=${encodeURIComponent(pathParam(unit.key, step))}`;
  switch (s.kind) {
    case 'words':
      return `/words?topic=${encodeURIComponent(s.topic)}&${p}`;
    case 'grammar':
      return `/grammar/${s.card}?${p}`;
    case 'drill':
      return `/drill/${s.category}?${p}`;
    case 'scene':
      return `/scene/${s.scene}?${p}`;
    case 'ownScene':
      return `/scenes?own=${encodeURIComponent(texts.tutorText ?? s.situation_en)}&${p}`;
    case 'write':
      return `/write/${s.task}?${p}`;
    case 'ask': {
      const q = texts.tutorText ?? s.question_en;
      const shown = texts.shownText ?? q;
      return `/tutor?q=${encodeURIComponent(q)}${shown !== q ? `&shown=${encodeURIComponent(shown)}` : ''}&${p}`;
    }
    case 'read':
      return `/read?topic=${encodeURIComponent(s.topic)}&${p}`;
    case 'check':
      return `/path/check/${unit.key}?${p}`;
  }
}
