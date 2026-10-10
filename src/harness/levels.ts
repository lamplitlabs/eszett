// The app covers CEFR A1 to C2, the levels the model was trained and gated on (the toolkit's level batteries;
// C2 came with the v25 student). Every prompt states the learner's level ("I'm at A2 level."), the phrasing
// the model was trained with, and every drill pool is cut at the level.

import { PROMPT_TEXTS } from './promptTexts';
import type { Lang } from './route';

export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export const LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const TOP_LEVEL: Level = 'C2';

export interface LevelInfo {
  level: Level;
  name: string;
  canDo: string;
  example: string;
  exampleGloss: string;
}

export const LEVEL_INFO: Record<Level, LevelInfo> = {
  A1: {
    level: 'A1',
    name: 'Beginner',
    canDo: 'Introduce yourself, order food, ask simple questions about prices and times.',
    example: 'Ich heiße Sam und wohne in Köln.',
    exampleGloss: 'My name is Sam and I live in Cologne.',
  },
  A2: {
    level: 'A2',
    name: 'Elementary',
    canDo: 'Talk about your day and your past weekend, make appointments, write short messages.',
    example: 'Am Wochenende bin ich mit Freunden ins Kino gegangen.',
    exampleGloss: 'At the weekend I went to the cinema with friends.',
  },
  B1: {
    level: 'B1',
    name: 'Intermediate',
    canDo: 'Handle everyday situations on your own, give reasons and opinions, write personal and simple formal emails.',
    example: 'Ich konnte nicht kommen, weil ich länger arbeiten musste.',
    exampleGloss: 'I could not come because I had to work longer.',
  },
  B2: {
    level: 'B2',
    name: 'Upper intermediate',
    canDo: 'Discuss abstract topics, argue for and against, write clear formal complaints and applications.',
    example: 'Obwohl die Miete gestiegen ist, möchte ich die Wohnung behalten.',
    exampleGloss: 'Although the rent has gone up, I would like to keep the flat.',
  },
  C1: {
    level: 'C1',
    name: 'Advanced',
    canDo: 'Follow demanding texts and talks, argue a position with nuance, write well-structured essays, reports and formal statements.',
    example: 'Angesichts der steigenden Mieten fordern viele, dass der Wohnungsbau beschleunigt werde.',
    exampleGloss: 'In view of rising rents, many are demanding that housing construction be speeded up.',
  },
  C2: {
    level: 'C2',
    name: 'Mastery',
    canDo: 'Understand practically everything you read or hear, weigh up arguments from several sources, and express fine shades of meaning in any register, from a formal objection to a review.',
    example: 'Kaum war der Kompromiss verkündet, wurde er von denselben Abgeordneten, die ihn ausgehandelt hatten, bereits wieder infrage gestellt.',
    exampleGloss: 'Scarcely had the compromise been announced when it was already being called into question again by the very members who had negotiated it.',
  },
};

/** The level names and can-do lines in German, for the app in German (the other languages are overlays, see src/i18n/content.ts). */
export const LEVEL_INFO_DE: Record<Level, Pick<LevelInfo, 'name' | 'canDo'>> = {
  A1: { name: 'Anfänger', canDo: 'Dich vorstellen, Essen bestellen, einfache Fragen zu Preisen und Uhrzeiten stellen.' },
  A2: { name: 'Grundstufe', canDo: 'Über deinen Tag und dein Wochenende sprechen, Termine vereinbaren, kurze Nachrichten schreiben.' },
  B1: { name: 'Mittelstufe', canDo: 'Alltagssituationen allein bewältigen, Gründe und Meinungen nennen, persönliche und einfache formelle E-Mails schreiben.' },
  B2: { name: 'Obere Mittelstufe', canDo: 'Über abstrakte Themen diskutieren, Für und Wider abwägen, klare formelle Beschwerden und Bewerbungen schreiben.' },
  C1: { name: 'Fortgeschritten', canDo: 'Anspruchsvolle Texte und Vorträge verstehen, differenziert argumentieren, gut strukturierte Essays, Berichte und formelle Stellungnahmen schreiben.' },
  C2: { name: 'Nahezu muttersprachlich', canDo: 'Praktisch alles mühelos verstehen, Argumente aus mehreren Quellen gegeneinander abwägen und dich in jedem Register mit feinen Bedeutungsnuancen ausdrücken, vom formellen Einspruch bis zur Rezension.' },
};

/** "A2.1" -> "A2"; anything outside A1-C2 (or unknown) -> null. */
export function cefrOf(sublevel: string | undefined | null): Level | null {
  const m = /^(A1|A2|B1|B2|C1|C2)/i.exec(sublevel ?? '');
  return m ? (m[1].toUpperCase() as Level) : null;
}

export const levelIndex = (level: Level) => LEVELS.indexOf(level);

/** True when `item` is at or below the learner's level. */
export const atOrBelow = (item: Level, learner: Level) => levelIndex(item) <= levelIndex(learner);

/** True when the learner is at `min` or above ("from B1 up"). */
export const atLeast = (learner: Level, min: Level) => levelIndex(learner) >= levelIndex(min);

/** The sentence that tells the model the learner's level, in the learner's language. */
export function levelSentence(level: Level, lang: Lang): string {
  return (PROMPT_TEXTS[lang] ?? PROMPT_TEXTS.en).level(level);
}
