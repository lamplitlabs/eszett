// C1 and C2 end to end: the levels themselves, the content pools built on them, and what the C1 (v2x) and C2 (v25)
// releases of the model added.
import { describe, expect, it } from 'vitest';

import grammarCards from '../../data/grammar.json';
import lexiconCore from '../../data/lexicon-core.json';
import scenes from '../../data/scenes.json';
import togetherData from '../../data/together.json';
import { localizeGrammar, localizeLevel, localizeScene, localizeWriting } from '../../i18n/content';
import { LANGUAGES } from '../../i18n/languages';
import { OVERLAYS } from '../../i18n/overlays';
import { buildDrillSet, makeRng } from '../drills';
import { atLeast, atOrBelow, cefrOf, LEVEL_INFO, LEVEL_INFO_DE, LEVELS, levelSentence, TOP_LEVEL } from '../levels';
import { drillable, LexiconIndex, nounsUpTo, type LexiconData, type LexNoun } from '../lexicon';
import { readCounterpartLine, type SceneCard } from '../roleplay';
import { STORY_OPENERS, TABOO_BUNDLED } from '../together';
import type { GrammarCard } from '../tutor';
import { precheckText, tasksFor, WRITE_TASKS } from '../writing';

const coreLex = new LexiconIndex(lexiconCore as unknown as LexiconData);
const cards = scenes as unknown as SceneCard[];
const grammar = grammarCards as unknown as GrammarCard[];

describe('the C1 and C2 levels', () => {
  it('end the scale, C2 on top of C1 on top of B2', () => {
    expect(LEVELS).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
    expect(TOP_LEVEL).toBe('C2');
    expect(atOrBelow('C1', 'B2')).toBe(false);
    expect(atOrBelow('B2', 'C1')).toBe(true);
    expect(atOrBelow('C2', 'C1')).toBe(false);
    expect(atOrBelow('C1', 'C2')).toBe(true);
    expect(atLeast('C1', 'B2')).toBe(true);
    expect(atLeast('C2', 'C1')).toBe(true);
    expect(atLeast('B1', 'B2')).toBe(false);
  });
  it('reads sublevels up to C2 and nothing beyond', () => {
    expect(cefrOf('C1')).toBe('C1');
    expect(cefrOf('C1.2')).toBe('C1');
    expect(cefrOf('b2.1')).toBe('B2');
    expect(cefrOf('C2')).toBe('C2');
    expect(cefrOf('c2.1')).toBe('C2');
    expect(cefrOf('C3')).toBeNull();
    expect(cefrOf('D1')).toBeNull();
    expect(cefrOf(undefined)).toBeNull();
  });
  it('describes both in English and German, and the level sentence names them as in the gate prompts', () => {
    expect(LEVEL_INFO.C1.name).toBe('Advanced');
    expect(LEVEL_INFO.C2.name).toBe('Mastery');
    expect(LEVEL_INFO.C1.example).toMatch(/\p{L}/u);
    expect(LEVEL_INFO.C2.example).toMatch(/\p{L}/u);
    expect(LEVEL_INFO_DE.C1.name).toBeTruthy();
    expect(LEVEL_INFO_DE.C2.name).toBeTruthy();
    expect(levelSentence('C1', 'en')).toBe("I'm at C1 level.");
    expect(levelSentence('C2', 'en')).toBe("I'm at C2 level.");
    for (const level of LEVELS) expect(LEVEL_INFO[level]).toBeDefined();
  });
  it('has both level cards translated for every app language', () => {
    for (const lang of LANGUAGES) {
      if (lang === 'en' || lang === 'de') continue;
      for (const level of ['C1', 'C2'] as const) {
        const info = localizeLevel(LEVEL_INFO[level], lang);
        expect(info.name, `${lang} ${level}`).not.toBe(LEVEL_INFO[level].name);
        expect(info.canDo, `${lang} ${level}`).not.toBe(LEVEL_INFO[level].canDo);
        expect(info.example).toBe(LEVEL_INFO[level].example);
      }
    }
  });
});

describe('the C1 lexicon tier', () => {
  const noun = (over: Partial<LexNoun>): LexNoun => ({ lemma: 'Beispiel', genus: 'n', plural: [], meaning: 'example', level: 'C1', ...over });
  it('takes a C1 noun only when the corpus has seen it; the curated tiers go in as they are', () => {
    expect(drillable(noun({ freq: 3 }))).toBe(true);
    expect(drillable(noun({ freq: 0 }))).toBe(false);
    expect(drillable(noun({}))).toBe(true); // the core lexicon was cut by the same rule and carries no freq
    expect(drillable(noun({ level: 'B2', freq: 0 }))).toBe(true);
    // a C2 tier (none shipped yet) would be harvested like C1 and is cut the same way
    expect(drillable(noun({ level: 'C2', freq: 9 }))).toBe(true);
    expect(drillable(noun({ level: 'C2', freq: 0 }))).toBe(false);
    expect(drillable(noun({ level: 'C3', freq: 9 }))).toBe(false);
    expect(drillable(noun({ meaning: '' as unknown as string, freq: 9 }))).toBe(false);
  });
  it('ships a C1 pool in the core lexicon and keeps the lower levels in the C1 drill set', () => {
    const c1 = nounsUpTo(coreLex, 'C1', 'C1');
    expect(c1.length).toBeGreaterThanOrEqual(100);
    expect(c1.every((n) => cefrOf(n.level) === 'C1' && n.meaning)).toBe(true);
    const upTo = nounsUpTo(coreLex, 'C1');
    expect(upTo.length).toBeGreaterThan(c1.length);
    expect(upTo.length).toBe(nounsUpTo(coreLex, 'B2').length + c1.length);
    expect(nounsUpTo(coreLex, 'B2').some((n) => cefrOf(n.level) === 'C1')).toBe(false);
    // a C1 drill set draws from the whole pool and the verb drill still has verbs to give
    const set = buildDrillSet('article', 'C1', coreLex, makeRng(3), 10);
    expect(set).toHaveLength(10);
    expect(buildDrillSet('verbs', 'C1', coreLex, makeRng(3), 6)).toHaveLength(6);
  });
  it('gives C2 the whole pool: v16 has no C2 tier, so the C2 drills draw from everything up to C1', () => {
    expect(nounsUpTo(coreLex, 'C2', 'C2')).toEqual([]);
    expect(nounsUpTo(coreLex, 'C2').length).toBe(nounsUpTo(coreLex, 'C1').length);
    expect(buildDrillSet('article', 'C2', coreLex, makeRng(5), 10)).toHaveLength(10);
    expect(buildDrillSet('verbs', 'C2', coreLex, makeRng(5), 6)).toHaveLength(6);
  });
  it('has every C1 noun of the core in every content overlay', () => {
    const c1 = nounsUpTo(coreLex, 'C1', 'C1');
    for (const [lang, overlay] of Object.entries(OVERLAYS)) {
      const missing = c1.filter((n) => !overlay.lexicon?.[n.lemma]?.trim());
      expect(missing.map((n) => n.lemma), lang).toEqual([]);
    }
  });
});

describe('C1 content', () => {
  it('has seven grammar cards with examples, each translated (five from v23, two from the learning path)', () => {
    const c1 = grammar.filter((c) => c.level === 'C1');
    expect(c1.map((c) => c.key).sort()).toEqual(['konjunktiv-i-redewiedergabe', 'nominalstil-verbalstil', 'partizipialattribut', 'partizipialsaetze', 'passiversatz', 'subjektive-modalverben', 'textkonnektoren-kohaerenz']);
    for (const card of c1) {
      expect(card.examples.length).toBeGreaterThanOrEqual(3);
      expect(card.items.length).toBeGreaterThanOrEqual(2);
      const pl = localizeGrammar(card, 'pl');
      expect(pl.title_en, card.key).not.toBe(card.title_en);
      expect(pl.rule_en, card.key).not.toBe(card.rule_en);
      expect(pl.title_de).toBe(card.title_de);
      expect(pl.examples.map((e) => e[0])).toEqual(card.examples.map((e) => e[0])); // the German side stays
    }
  });
  it('has three formal C1 scenes whose facts are figures the counterpart may quote', () => {
    const c1 = cards.filter((c) => c.level === 'C1');
    expect(c1.map((c) => c.key).sort()).toEqual(['rent_increase', 'salary_negotiation', 'town_hall_traffic']);
    for (const card of c1) {
      expect(card.register).toBe('Sie');
      expect(card.facts.length).toBeGreaterThanOrEqual(4);
      expect(card.beats.length).toBeGreaterThanOrEqual(3);
      for (const beat of card.beats) expect(card.facts.map((f) => f.key), `${card.key}: beat asks ${beat.asks}`).toContain(beat.asks);
      // the opening line is in character: a question, no figure that is not in the facts, not too long
      expect(readCounterpartLine(card.opening, card, false).tells, card.key).toEqual([]);
      const tr = localizeScene(card, 'tr');
      expect(tr.situation_en, card.key).not.toBe(card.situation_en);
      expect(tr.opening).toBe(card.opening);
    }
  });
  it('has long C1 writing tasks, one per week, whose precheck accepts the formal Ihr/Ihnen', () => {
    const c1 = tasksFor('C1');
    expect(c1.map((t) => t.id)).toEqual([
      'c1-letter-to-editor',
      'c1-statement-management',
      'c1-graph-commuting',
      'c1-rent-increase-objection',
      'c1-wind-farm-statement',
      'c1-letter-about-novel',
      'c1-report-ai-at-work',
      'c1-proposal-car-free-centre',
    ]);
    expect(c1.every((t) => t.words[0] >= 180)).toBe(true);
    expect(c1.filter((t) => t.register === 'formal').length).toBeGreaterThanOrEqual(7);
    expect(WRITE_TASKS.filter((t) => t.level === 'C1')).toEqual(c1);
    const task = c1[1];
    const body = [
      'Sehr geehrte Damen und Herren,',
      'als Sprecher unseres Teams möchte ich zu Ihrem Vorhaben Stellung nehmen, das Homeoffice abzuschaffen. Derzeit arbeiten wir an zwei Tagen pro Woche von zu Hause, und diese Regelung hat sich bewährt.',
      'Die Folge Ihres Plans wäre ein spürbarer Verlust an Motivation; mehrere Kolleginnen haben bereits eine Kündigung in Erwägung gezogen.',
      'Wir schlagen daher einen Kompromiss vor: drei Präsenztage und zwei Tage Homeoffice, verbunden mit festen Kernzeiten für Besprechungen.',
      'Wir bitten Sie um ein Gespräch, in dem wir Ihnen unsere Erfahrungen darlegen können, und danken Ihnen für Ihr Verständnis.',
      'Mit freundlichen Grüßen',
      'Sam Müller',
    ].join('\n');
    const p = precheckText(task, body);
    expect(p).toMatchObject({ opening: true, closing: true, noDu: true });
    expect(p.points.every((x) => x.hit)).toBe(true);
    // a real du slips through the formal pronouns
    expect(precheckText(task, body.replace('danken Ihnen', 'danke dir')).noDu).toBe(false);
    const es = localizeWriting(task, 'es');
    expect(es.title).not.toBe(task.title);
    expect(es.points.map((x) => x.any)).toEqual(task.points.map((x) => x.any)); // the German key words stay
  });
  it('has talking points, taboo cards and story openers at C1 like every other level', () => {
    const points = (togetherData as { level: string }[]).filter((p) => p.level === 'C1');
    expect(points).toHaveLength((togetherData as unknown[]).length / LEVELS.length);
    expect(TABOO_BUNDLED.filter((c) => c.level === 'C1').length).toBeGreaterThanOrEqual(10);
    expect(STORY_OPENERS.C1.length).toBeGreaterThanOrEqual(3);
  });
});

describe('C2 content', () => {
  it('has seven grammar cards on register, paronyms and formal syntax, each translated (five from v25, two from the learning path)', () => {
    const c2 = grammar.filter((c) => c.level === 'C2');
    expect(c2.map((c) => c.key).sort()).toEqual(['erzaehltempora-erlebte-rede', 'es-als-platzhalter-korrelat', 'funktionsverbgefuege', 'gehobene-praepositionen', 'nachfeld-ausklammerung', 'paronyme-scheinbar-anscheinend', 'stilebenen-register']);
    for (const card of c2) {
      expect(card.examples.length).toBeGreaterThanOrEqual(3);
      expect(card.pitfalls.length).toBeGreaterThanOrEqual(2);
      expect(card.items.length).toBeGreaterThanOrEqual(2);
      for (const lang of LANGUAGES) {
        if (lang === 'en' || lang === 'de') continue;
        const t = localizeGrammar(card, lang);
        expect(t.title_en, `${lang} ${card.key}`).not.toBe(card.title_en);
        expect(t.rule_en, `${lang} ${card.key}`).not.toBe(card.rule_en);
        expect(t.title_de).toBe(card.title_de);
        expect(t.examples.map((e) => e[0])).toEqual(card.examples.map((e) => e[0]));
      }
    }
  });
  it('has three formal C2 scenes whose openings pass the counterpart check', () => {
    const c2 = cards.filter((c) => c.level === 'C2');
    expect(c2.map((c) => c.key).sort()).toEqual(['press_interview_study', 'publishing_contract', 'tax_office_objection']);
    for (const card of c2) {
      expect(card.register).toBe('Sie');
      expect(card.facts.length).toBeGreaterThanOrEqual(4);
      expect(card.beats.length).toBeGreaterThanOrEqual(3);
      for (const beat of card.beats) expect(card.facts.map((f) => f.key), `${card.key}: beat asks ${beat.asks}`).toContain(beat.asks);
      expect(readCounterpartLine(card.opening, card, false).tells, card.key).toEqual([]);
      // the scripted replies quote only the facts: the same check the model's lines go through
      for (const beat of card.beats) expect(readCounterpartLine(beat.reply, card, false).tells, `${card.key}: ${beat.asks}`).toEqual([]);
      for (const lang of LANGUAGES) {
        if (lang === 'en' || lang === 'de') continue;
        const t = localizeScene(card, lang);
        expect(t.situation_en, `${lang} ${card.key}`).not.toBe(card.situation_en);
        expect(t.opening).toBe(card.opening);
      }
    }
  });
  it('has long C2 writing tasks, one per week: objections, statements, an open letter, a briefing and a chronicle', () => {
    const c2 = tasksFor('C2');
    expect(c2.map((t) => t.id)).toEqual([
      'c2-objection-bank-fees',
      'c2-expert-statement-council',
      'c2-open-letter-museum',
      'c2-email-journalist-research',
      'c2-tax-office-objection',
      'c2-style-guide-email',
      'c2-family-chronicle-letter',
      'c2-briefing-ethics-council',
    ]);
    expect(c2.every((t) => t.words[0] >= 220)).toBe(true);
    expect(c2.filter((t) => t.register === 'formal').length).toBeGreaterThanOrEqual(7);
    const task = c2[0];
    const body = [
      'Sehr geehrte Damen und Herren,',
      'hiermit lege ich Einspruch gegen die Kontoführungsgebühren ein, die Sie seit dem 1. April vor zwei Jahren monatlich mit 9,90 Euro statt der vereinbarten 4,90 Euro erheben, ohne dass ich dieser Erhöhung je ausdrücklich zugestimmt hätte.',
      'Nach der Rechtsprechung des Bundesgerichtshofs ist eine Entgelterhöhung durch stillschweigende Zustimmung unwirksam; auf eine solche Zustimmung können Sie sich daher nicht berufen.',
      'Ich fordere Sie auf, mir die zu viel gezahlten Entgelte bis zum 30. Juni zu erstatten.',
      'Andernfalls werde ich die Ombudsstelle der privaten Banken einschalten und behalte mir rechtliche Schritte vor.',
      'Mit freundlichen Grüßen',
      'Sam Müller',
    ].join('\n');
    const p = precheckText(task, body);
    expect(p).toMatchObject({ opening: true, closing: true, noDu: true });
    expect(p.points.every((x) => x.hit)).toBe(true);
    expect(precheckText(task, 'Sehr geehrte Damen und Herren, ich bin unwirksam müde. Mit freundlichen Grüßen').points.filter((x) => x.hit).map((x) => x.en)).toEqual(['the legal basis and the ruling you rely on']);
    for (const lang of LANGUAGES) {
      if (lang === 'en' || lang === 'de') continue;
      const t = localizeWriting(task, lang);
      expect(t.title, lang).not.toBe(task.title);
      expect(t.points.map((x) => x.any)).toEqual(task.points.map((x) => x.any));
    }
  });
  it('has talking points, taboo cards and story openers at C2 like every other level', () => {
    const points = (togetherData as { level: string; words: string[] }[]).filter((p) => p.level === 'C2');
    expect(points).toHaveLength((togetherData as unknown[]).length / LEVELS.length);
    expect(TABOO_BUNDLED.filter((c) => c.level === 'C2').length).toBeGreaterThanOrEqual(10);
    expect(STORY_OPENERS.C2.length).toBeGreaterThanOrEqual(3);
  });
});
