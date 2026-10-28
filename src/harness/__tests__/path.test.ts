// The learning path: every step points at something the app ships, the progress rules, the routes, and the
// translations of the units.
import { describe, expect, it } from 'vitest';

import grammarCards from '../../data/grammar.json';
import pathData from '../../data/path.json';
import scenes from '../../data/scenes.json';
import { stepLabel, stepRoute } from '../../features/path';
import { WORD_TOPIC_KEY, WORD_TOPICS } from '../../features/topics';
import { localizePathUnit } from '../../i18n/content';
import { LANGUAGES } from '../../i18n/languages';
import { OVERLAYS } from '../../i18n/overlays';
import { LEVELS } from '../levels';
import { levelProgress, nextStep, parsePathParam, PATH_UNITS, pathDoneKey, pathParam, type PathUnit, stepDone, stepHref, unitByKey, unitDone, unitsFor } from '../path';
import { WRITE_TASKS } from '../writing';

const cardKeys = new Set((grammarCards as { key: string }[]).map((c) => c.key));
const sceneKeys = new Set((scenes as { key: string }[]).map((s) => s.key));
const taskIds = new Set(WRITE_TASKS.map((t) => t.id));
const DRILLS = ['article', 'plural', 'meaning', 'verbs', 'numbers', 'clock', 'dates', 'prices', 'ordinals', 'sentence'];

describe('the course data', () => {
  it('is the bundled path.json, eight to twelve units per level, keyed by level and number', () => {
    expect(PATH_UNITS).toBe(pathData as unknown as PathUnit[]);
    const keys = PATH_UNITS.map((u) => u.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const level of LEVELS) {
      const units = unitsFor(level);
      expect(units.length, level).toBeGreaterThanOrEqual(8);
      expect(units.length, level).toBeLessThanOrEqual(12);
      units.forEach((u, i) => {
        expect(u.key).toBe(`${level.toLowerCase()}-${String(i + 1).padStart(2, '0')}`);
        expect(u.level).toBe(level);
        for (const f of ['title_de', 'title_en', 'goal_de', 'goal_en'] as const) expect(u[f].trim(), `${u.key} ${f}`).not.toBe('');
        expect(u.steps.length, u.key).toBeGreaterThanOrEqual(4);
      });
    }
  });

  it('points every step at content the app ships', () => {
    for (const u of PATH_UNITS) {
      for (const s of u.steps) {
        const where = `${u.key} ${s.kind}`;
        if (s.kind === 'grammar') expect(cardKeys.has(s.card), `${where} ${s.card}`).toBe(true);
        else if (s.kind === 'scene') expect(sceneKeys.has(s.scene), `${where} ${s.scene}`).toBe(true);
        else if (s.kind === 'write') expect(taskIds.has(s.task), `${where} ${s.task}`).toBe(true);
        else if (s.kind === 'drill') expect(DRILLS, where).toContain(s.category);
        else if (s.kind === 'words') {
          expect(WORD_TOPICS[u.level], `${where} ${s.topic}`).toContain(s.topic);
          expect(WORD_TOPIC_KEY[s.topic], `${where} ${s.topic} has a topics.* key`).toBeTruthy();
        } else if (s.kind === 'ask') expect(s.question_en && s.question_de, where).toBeTruthy();
        else expect(s.situation_en && s.situation_de, where).toBeTruthy();
      }
    }
  });

  it('gives every unit words, grammar or a conversation, and never repeats a card, scene or task within a level', () => {
    for (const level of LEVELS) {
      const seen = new Map<string, string>();
      for (const u of unitsFor(level)) {
        const kinds = new Set(u.steps.map((s) => s.kind));
        expect(kinds.has('words'), u.key).toBe(true);
        expect(kinds.has('grammar') || kinds.has('scene') || kinds.has('ownScene'), u.key).toBe(true);
        for (const s of u.steps) {
          const ref = s.kind === 'grammar' ? `card:${s.card}` : s.kind === 'scene' ? `scene:${s.scene}` : s.kind === 'write' ? `task:${s.task}` : null;
          if (!ref) continue;
          expect(seen.get(ref), `${ref} in ${u.key} and ${seen.get(ref)}`).toBeUndefined();
          seen.set(ref, u.key);
        }
      }
    }
  });

  it('uses every bundled scene and writing task, and every writing task at its own level', () => {
    const usedScenes = new Set<string>();
    const usedTasks = new Set<string>();
    for (const u of PATH_UNITS)
      for (const s of u.steps) {
        if (s.kind === 'scene') usedScenes.add(s.scene);
        if (s.kind === 'write') {
          usedTasks.add(s.task);
          expect(WRITE_TASKS.find((t) => t.id === s.task)?.level, `${u.key} ${s.task}`).toBe(u.level);
        }
      }
    expect([...sceneKeys].filter((k) => !usedScenes.has(k))).toEqual([]);
    expect([...taskIds].filter((k) => !usedTasks.has(k))).toEqual([]);
  });

  it('keeps a grammar card within one level of the unit that teaches it', () => {
    for (const u of PATH_UNITS)
      for (const s of u.steps) {
        if (s.kind !== 'grammar') continue;
        const card = (grammarCards as { key: string; level: string }[]).find((c) => c.key === s.card)!;
        expect(Math.abs(LEVELS.indexOf(card.level as (typeof LEVELS)[number]) - LEVELS.indexOf(u.level)), `${u.key} ${s.card} (${card.level})`).toBeLessThanOrEqual(1);
      }
  });
});

describe('progress', () => {
  const unit = unitByKey('a1-03')!; // words, grammar, drill, scene, scene, write

  it('counts a step done from the path, or when its card, scene or task was finished on its own', () => {
    expect(stepDone(unit, 0, {})).toBe(false);
    expect(stepDone(unit, 0, { [pathDoneKey(pathParam('a1-03', 0))]: 1 })).toBe(true);
    expect(stepDone(unit, 1, { 'grammar:artikel-nominativ-akkusativ': 1 })).toBe(true);
    expect(stepDone(unit, 3, { 'scene:cafe': 1 })).toBe(true);
    expect(stepDone(unit, 5, { 'write:a1-cafe-invite': 1 })).toBe(true);
    expect(stepDone(unit, 2, { 'grammar:artikel-nominativ-akkusativ': 1, 'scene:cafe': 1 })).toBe(false); // a drill only counts from the path
    expect(stepDone(unit, 99, { 'path:a1-03:99': 1 })).toBe(true);
    expect(stepDone(unit, 99, {})).toBe(false);
  });

  it('finds the next step and the unit, and the level ratio', () => {
    expect(nextStep(unit, {})).toBe(0);
    const done: Record<string, number> = { 'path:a1-03:0': 1, 'grammar:artikel-nominativ-akkusativ': 1 };
    expect(nextStep(unit, done)).toBe(2);
    expect(unitDone(unit, done)).toBe(false);
    const all = Object.fromEntries(unit.steps.map((_, i) => [pathDoneKey(pathParam(unit.key, i)), 1]));
    expect(nextStep(unit, all)).toBeNull();
    expect(unitDone(unit, all)).toBe(true);

    const empty = levelProgress('A1', {});
    expect(empty.finished).toBe(0);
    expect(empty.current?.key).toBe('a1-01');
    expect(empty.ratio).toBe(0);
    const withUnit = levelProgress('A1', all);
    expect(withUnit.finished).toBe(1);
    expect(withUnit.current?.key).toBe('a1-01');
    expect(withUnit.ratio).toBeGreaterThan(0);
    const complete = levelProgress(
      'C2',
      Object.fromEntries(unitsFor('C2').flatMap((u) => u.steps.map((_, i) => [pathDoneKey(pathParam(u.key, i)), 1]))),
    );
    expect(complete.current).toBeNull();
    expect(complete.finished).toBe(unitsFor('C2').length);
    expect(complete.ratio).toBe(1);
  });

  it('round-trips the path parameter', () => {
    expect(parsePathParam(pathParam('b2-07', 3))).toEqual({ unit: 'b2-07', step: 3 });
    expect(parsePathParam('lesson:3')).toBeNull();
    expect(parsePathParam(undefined)).toBeNull();
    expect(pathDoneKey('a1-01:0')).toBe('path:a1-01:0');
  });
});

describe('routes and labels', () => {
  it('opens the existing screens with the path parameter', () => {
    const a1 = unitByKey('a1-01')!;
    expect(stepHref(a1, 0)).toBe('/words?topic=greetings%20and%20introductions&path=a1-01%3A0');
    expect(stepHref(a1, 1)).toBe('/grammar/sein-haben-praesens?path=a1-01%3A1');
    expect(stepHref(a1, 3)).toBe('/drill/numbers?path=a1-01%3A3');
    expect(stepHref(a1, 4)).toContain('/tutor?q=How%20do%20I%20introduce%20myself');
    expect(stepHref(a1, 4)).not.toContain('&shown=');
    expect(stepHref(a1, 4, { tutorText: 'Frage', shownText: 'Pytanie' })).toBe('/tutor?q=Frage&shown=Pytanie&path=a1-01%3A4');
    expect(stepHref(a1, 5)).toBe(`/scenes?own=${encodeURIComponent('meeting a new colleague on your first day and introducing yourself')}&path=a1-01%3A5`);
    const a1_3 = unitByKey('a1-03')!;
    expect(stepHref(a1_3, 3)).toBe('/scene/cafe?path=a1-03%3A3');
    expect(stepHref(a1_3, 5)).toBe('/write/a1-cafe-invite?path=a1-03%3A5');
  });

  it('sends the question to the tutor in its language and shows it in the app language', () => {
    const a1 = unitByKey('a1-01')!;
    expect(stepRoute(a1, 4, 'de', 'de')).toBe(`/tutor?q=${encodeURIComponent('Wie stelle ich mich auf Deutsch vor, formell und informell?')}&path=a1-01%3A4`);
    const pl = stepRoute(a1, 4, 'pl', 'en');
    expect(pl.startsWith('/tutor?q=How%20do%20I%20introduce%20myself')).toBe(true);
    expect(pl).toContain('&shown=');
    expect(decodeURIComponent(pl.split('&shown=')[1].split('&')[0])).toBe(localizePathUnit(a1, 'pl').steps[4].kind === 'ask' ? (localizePathUnit(a1, 'pl').steps[4] as { question_en: string }).question_en : '');
    // a scene is designed from the English description whatever the languages
    expect(stepRoute(a1, 5, 'de', 'de')).toContain(`own=${encodeURIComponent('meeting a new colleague on your first day and introducing yourself')}`);
    // the other kinds carry no text
    expect(stepRoute(a1, 1, 'fr', 'fr')).toBe(stepHref(a1, 1));
  });

  it('labels every step in English and German', () => {
    for (const u of PATH_UNITS)
      u.steps.forEach((s, i) => {
        for (const lang of ['en', 'de'] as const) {
          const { title } = stepLabel(u, i, lang);
          expect(title.trim(), `${u.key} ${i} ${lang}`).not.toBe('');
          expect(title, `${u.key} ${i} ${lang}`).not.toMatch(/^(lesson|path|drill)\./);
        }
        if (s.kind === 'ask') expect(stepLabel(u, i, 'de').title).toBe(s.question_de);
        if (s.kind === 'words') expect(stepLabel(u, i, 'en').title).toBe(`Words: ${s.topic}`);
      });
  });
});

describe('translations', () => {
  it('shows the German unit in German, the English one in English', () => {
    const u = unitByKey('a2-01')!;
    expect(localizePathUnit(u, 'en')).toBe(u);
    const de = localizePathUnit(u, 'de');
    expect(de.title_en).toBe(u.title_de);
    expect(de.goal_en).toBe(u.goal_de);
    const ask = de.steps.find((s) => s.kind === 'ask');
    expect(ask && ask.kind === 'ask' ? ask.question_en : null).toBe((u.steps.find((s) => s.kind === 'ask') as { question_de: string }).question_de);
  });

  it('has every unit, every question and every situation in every content overlay', () => {
    for (const lang of LANGUAGES) {
      if (lang === 'en' || lang === 'de') continue;
      const overlay = OVERLAYS[lang];
      for (const u of PATH_UNITS) {
        const t = localizePathUnit(u, lang);
        expect(t.title_en, `${lang} ${u.key} title`).not.toBe(u.title_en);
        expect(t.goal_en, `${lang} ${u.key} goal`).not.toBe(u.goal_en);
        expect(t.title_de).toBe(u.title_de);
        expect(overlay?.path?.[u.key]?.steps?.length, `${lang} ${u.key} steps`).toBe(u.steps.length);
        u.steps.forEach((s, i) => {
          const shown = t.steps[i];
          if (s.kind === 'ask' && shown.kind === 'ask') expect(shown.question_en, `${lang} ${u.key} ${i}`).not.toBe(s.question_en);
          if (s.kind === 'ownScene' && shown.kind === 'ownScene') expect(shown.situation_en, `${lang} ${u.key} ${i}`).not.toBe(s.situation_en);
        });
      }
    }
  });
});
