// The mock oral exam (Prüfung Sprechen): the speaking part of the Goethe exams at each level, run on the phone
// with the tutor as examiner. The parts, their timing and their criteria follow the published formats - A1:
// introduce yourself, ask and answer with word cards, make a request; A2: questions about the person, talk about
// yourself, plan something together; B1: plan something together, present a topic, talk about it; B2 to C2: a
// talk and a discussion (telc and DTZ have the same shape at B1). The tutor writes the task sheet (a topic and
// points, like the exam's Aufgabenblatt), asks the examiner's follow-up, and rates what the candidate said on the
// exam's criteria; the app measures how much was said and how fast. The ratings are the model's reading of a
// transcript, the fluency is counted by code, and nothing judges the accent: a transcript cannot, and the screen
// says so.

import type { Level } from './levels';

export type ExamPartKind = 'intro' | 'cards' | 'request' | 'monologue' | 'plan' | 'talk';

export interface ExamPart {
  id: string;
  kind: ExamPartKind;
  title_de: string;
  /** The exam's own wording of what happens, English, for the overview. */
  about_en: string;
  /** Seconds to prepare once the task sheet is shown; 0 for none. */
  prepSeconds: number;
  /** How long the candidate is expected to speak in the main turn. */
  speakSeconds: number;
  /** Below this many words the turn counts as too short. */
  minWords: number;
  /** What the examiner says to open the part, German, read by the voice. */
  examiner_de: string;
  /** What the tutor is asked to write as the task sheet, English; null when the sheet is fixed. */
  sheet_en: string | null;
  /** A second turn: the examiner reacts or asks, the candidate answers. */
  followup: boolean;
}

export interface ExamSpec {
  level: Level;
  name: string;
  /** The real exam's speaking part, in minutes, for the overview. */
  minutes: number;
  parts: ExamPart[];
}

/** The task sheet the tutor wrote: a heading (topic, situation or thesis) and its points, both German. */
export interface ExamSheet {
  heading: string;
  points: string[];
}

export const EXAM_CRITERIA = ['fulfilment', 'coherence', 'vocabulary', 'structures'] as const;
export type ExamCriterion = (typeof EXAM_CRITERIA)[number];

/** The tutor's rating of a part: 0-4 per criterion as the Goethe grid, a comment, a tip and one improved sentence. */
export interface ExamRating {
  scores: Record<ExamCriterion, number>;
  comment: string;
  tip: string;
  better: string;
}

export interface ExamTurn {
  /** What the examiner said before this turn. */
  prompt: string;
  said: string;
  seconds: number;
}

export interface ExamPartResult {
  partId: string;
  turns: ExamTurn[];
  rating: ExamRating | null;
  fluency: number;
  words: number;
}

export const MAX_SCORE = 4;
export const PASS_PERCENT = 60;

const A1: ExamSpec = {
  level: 'A1',
  name: 'Goethe-Zertifikat A1: Start Deutsch 1',
  minutes: 15,
  parts: [
    {
      id: 'a1-1',
      kind: 'intro',
      title_de: 'Teil 1: Sich vorstellen',
      about_en: 'Introduce yourself with the seven points on the sheet; then spell a word and say a number.',
      prepSeconds: 0,
      speakSeconds: 45,
      minWords: 20,
      examiner_de: 'Guten Tag. Bitte stellen Sie sich vor: Name, Alter, Land, Wohnort, Sprachen, Beruf und Hobby.',
      sheet_en: null,
      followup: true,
    },
    {
      id: 'a1-2',
      kind: 'cards',
      title_de: 'Teil 2: Um Informationen bitten und Informationen geben',
      about_en: 'A topic and two word cards: ask a question with the first, answer the examiner with the second.',
      prepSeconds: 20,
      speakSeconds: 40,
      minWords: 10,
      examiner_de: 'Hier ist Ihr Thema mit zwei Karten. Stellen Sie mit der ersten Karte eine Frage, und antworten Sie dann auf meine Frage zur zweiten Karte.',
      sheet_en: 'a topic from everyday life (shopping, food, family, free time, work, living, travel) and two word cards for it: single nouns a beginner knows',
      followup: true,
    },
    {
      id: 'a1-3',
      kind: 'request',
      title_de: 'Teil 3: Bitten formulieren und darauf reagieren',
      about_en: 'Two pictures, described in words: ask for each politely; the examiner reacts.',
      prepSeconds: 15,
      speakSeconds: 30,
      minWords: 8,
      examiner_de: 'Sie sehen zwei Bilder. Bitten Sie mich um etwas oder bitten Sie mich, etwas zu tun.',
      sheet_en: 'two everyday objects or actions a beginner can ask for politely (a window to open, a pen, a glass of water, the time, the bill), each named in two or three German words as a picture caption',
      followup: true,
    },
  ],
};

const A2: ExamSpec = {
  level: 'A2',
  name: 'Goethe-Zertifikat A2',
  minutes: 15,
  parts: [
    {
      id: 'a2-1',
      kind: 'cards',
      title_de: 'Teil 1: Fragen zur Person stellen und beantworten',
      about_en: 'Four keyword cards: ask the examiner a question with each, and answer the examiner\'s questions.',
      prepSeconds: 15,
      speakSeconds: 60,
      minWords: 20,
      examiner_de: 'Hier sind vier Karten. Stellen Sie mir zu jeder Karte eine Frage, und beantworten Sie dann meine Fragen.',
      sheet_en: 'four keyword cards about a person\'s life (such as Wohnort, Beruf, Familie, Hobby, Sprachen, Tagesablauf, Urlaub, Essen), one word each',
      followup: true,
    },
    {
      id: 'a2-2',
      kind: 'monologue',
      title_de: 'Teil 2: Von sich erzählen',
      about_en: 'A topic with four guiding points; talk for about a minute, then answer one or two questions.',
      prepSeconds: 20,
      speakSeconds: 75,
      minWords: 40,
      examiner_de: 'Erzählen Sie bitte etwas über das Thema auf Ihrem Blatt. Die vier Punkte helfen Ihnen.',
      sheet_en: 'a personal topic (such as Mein Lieblingsessen, Mein Tagesablauf, Meine Freizeit, Mein Wohnort, Meine Familie, Mein letzter Urlaub) with four guiding points written as short questions (Was? Wann? Mit wem? Warum?)',
      followup: true,
    },
    {
      id: 'a2-3',
      kind: 'plan',
      title_de: 'Teil 3: Gemeinsam etwas planen',
      about_en: 'Plan something with the examiner as your partner: make suggestions, react, agree.',
      prepSeconds: 20,
      speakSeconds: 60,
      minWords: 30,
      examiner_de: 'Wir planen jetzt gemeinsam. Machen Sie einen Vorschlag, und wir sprechen darüber.',
      sheet_en: 'something two friends plan together (a present for a colleague, a day trip, a dinner, a visit to the cinema, a birthday party) with four points to settle (Wann? Wo? Was? Wer bringt was mit?)',
      followup: true,
    },
  ],
};

const B1: ExamSpec = {
  level: 'B1',
  name: 'Goethe-Zertifikat B1 (telc and DTZ have the same parts)',
  minutes: 15,
  parts: [
    {
      id: 'b1-1',
      kind: 'plan',
      title_de: 'Teil 1: Gemeinsam etwas planen',
      about_en: 'Plan something with the examiner as your partner, using the points on the sheet.',
      prepSeconds: 30,
      speakSeconds: 75,
      minWords: 40,
      examiner_de: 'Wir planen jetzt gemeinsam. Machen Sie bitte den Anfang.',
      sheet_en: 'something two people organise together (a farewell party for a colleague, a weekend trip, a visit from friends, a course project, a move) with four points to settle (when, where, who does what, what to bring)',
      followup: true,
    },
    {
      id: 'b1-2',
      kind: 'monologue',
      title_de: 'Teil 2: Ein Thema präsentieren',
      about_en: 'Present a topic in five slides: introduce it, your experience, the situation in your country, advantages and disadvantages with your opinion, a closing. About three minutes.',
      prepSeconds: 60,
      speakSeconds: 180,
      minWords: 90,
      examiner_de: 'Bitte präsentieren Sie Ihr Thema. Sie haben etwa drei Minuten.',
      sheet_en: 'a presentation topic for B1 phrased as a question (such as Brauchen Kinder ein Handy?, Ist Homeoffice besser?, Sollte man vegetarisch leben?, Urlaub im eigenen Land?) and the exam\'s five slide titles adapted to it: Thema vorstellen, Meine persönlichen Erfahrungen, Die Situation in meinem Heimatland, Vor- und Nachteile und meine Meinung, Abschluss und Dank',
      followup: false,
    },
    {
      id: 'b1-3',
      kind: 'talk',
      title_de: 'Teil 3: Über ein Thema sprechen',
      about_en: 'The examiner gives feedback on the presentation and asks two questions; answer them.',
      prepSeconds: 0,
      speakSeconds: 60,
      minWords: 30,
      examiner_de: 'Vielen Dank für Ihre Präsentation. Ich habe noch Fragen dazu.',
      sheet_en: null,
      followup: true,
    },
  ],
};

const B2: ExamSpec = {
  level: 'B2',
  name: 'Goethe-Zertifikat B2',
  minutes: 15,
  parts: [
    {
      id: 'b2-1',
      kind: 'monologue',
      title_de: 'Teil 1: Vortrag halten',
      about_en: 'A talk of about four minutes on a topic with three guiding points; then a question from the examiner.',
      prepSeconds: 90,
      speakSeconds: 240,
      minWords: 150,
      examiner_de: 'Bitte halten Sie Ihren Vortrag. Sie haben etwa vier Minuten.',
      sheet_en: 'a talk topic for B2 (society, work, media, environment, education, health) with three guiding points in the exam\'s style: describe several possibilities, name advantages and disadvantages, give and justify your own view',
      followup: true,
    },
    {
      id: 'b2-2',
      kind: 'talk',
      title_de: 'Teil 2: Diskussion führen',
      about_en: 'A thesis to discuss: take a position, react to the examiner\'s counter-arguments, defend yours.',
      prepSeconds: 30,
      speakSeconds: 90,
      minWords: 60,
      examiner_de: 'Hier ist eine These. Sagen Sie mir, was Sie davon halten, und begründen Sie Ihre Meinung.',
      sheet_en: 'a debatable thesis about life in Germany or Europe today (such as Autos sollten aus Innenstädten verschwinden, Noten in der Schule abschaffen, Homeoffice für alle), in one sentence, with two arguments for and two against listed as points',
      followup: true,
    },
  ],
};

const C1: ExamSpec = {
  level: 'C1',
  name: 'Goethe-Zertifikat C1',
  minutes: 16,
  parts: [
    {
      id: 'c1-1',
      kind: 'monologue',
      title_de: 'Teil 1: Vortrag',
      about_en: 'A structured talk of three to four minutes on a social topic with guiding points; then a question.',
      prepSeconds: 180,
      speakSeconds: 240,
      minWords: 180,
      examiner_de: 'Bitte halten Sie Ihren Vortrag. Sie haben drei bis vier Minuten.',
      sheet_en: 'a talk topic for C1 on a social or cultural question (work and life, digital media, migration and language, science and society, city and countryside) with four guiding points: the situation, causes, consequences, your assessment',
      followup: true,
    },
    {
      id: 'c1-2',
      kind: 'talk',
      title_de: 'Teil 2: Diskussion',
      about_en: 'A discussion on a thesis: argue, respond to objections, weigh positions.',
      prepSeconds: 30,
      speakSeconds: 120,
      minWords: 80,
      examiner_de: 'Hier ist die These für unsere Diskussion. Nehmen Sie bitte Stellung.',
      sheet_en: 'a controversial thesis on a social question for C1 (such as Soziale Medien schaden der Demokratie, Ein bedingungsloses Grundeinkommen, Studium für alle), in one sentence, with three arguments for and three against as points',
      followup: true,
    },
  ],
};

const C2: ExamSpec = {
  level: 'C2',
  name: 'Goethe-Zertifikat C2: Großes Deutsches Sprachdiplom',
  minutes: 15,
  parts: [
    {
      id: 'c2-1',
      kind: 'monologue',
      title_de: 'Teil 1: Vortrag',
      about_en: 'A talk of about five minutes on a demanding topic with guiding points; then a question.',
      prepSeconds: 180,
      speakSeconds: 300,
      minWords: 220,
      examiner_de: 'Bitte halten Sie Ihren Vortrag. Sie haben etwa fünf Minuten.',
      sheet_en: 'a demanding talk topic for C2 (ethics of technology, culture and memory, language policy, economy and justice, art and society) with four guiding points that ask for analysis, examples, counterpositions and a conclusion',
      followup: true,
    },
    {
      id: 'c2-2',
      kind: 'talk',
      title_de: 'Teil 2: Diskussion',
      about_en: 'A discussion with the examiner on a thesis, at full argumentative range.',
      prepSeconds: 30,
      speakSeconds: 150,
      minWords: 100,
      examiner_de: 'Zu dieser These möchte ich Ihre Position hören. Bitte argumentieren Sie.',
      sheet_en: 'a sharp thesis for an academic-level debate (such as Kunst muss nicht verständlich sein, Wissenschaft braucht keine Grenzen, Die Nation ist ein Auslaufmodell), in one sentence, with three arguments each way as points',
      followup: true,
    },
  ],
};

export const EXAMS: Record<Level, ExamSpec> = { A1, A2, B1, B2, C1, C2 };

/**
 * The sheets of the closed-set parts, shipped rather than written: the A1 word cards and pictures and the A2
 * person cards come from a small, well-known pool in the real exam, and a small model is not reliable at
 * producing two bare nouns on request. A day picks a sheet; "Try again" the next.
 */
export const FIXED_SHEETS: Record<string, ExamSheet[]> = {
  'a1-2': [
    { heading: 'Thema: Einkaufen', points: ['Supermarkt', 'Preis'] },
    { heading: 'Thema: Essen und Trinken', points: ['Frühstück', 'Restaurant'] },
    { heading: 'Thema: Freizeit', points: ['Kino', 'Sport'] },
    { heading: 'Thema: Familie', points: ['Geschwister', 'Kinder'] },
    { heading: 'Thema: Wohnen', points: ['Wohnung', 'Miete'] },
    { heading: 'Thema: Arbeit', points: ['Beruf', 'Kollegen'] },
    { heading: 'Thema: Reisen', points: ['Zug', 'Hotel'] },
    { heading: 'Thema: Tagesablauf', points: ['Uhrzeit', 'Wochenende'] },
    { heading: 'Thema: Einkaufen', points: ['Obst', 'Öffnungszeiten'] },
    { heading: 'Thema: Freizeit', points: ['Musik', 'Freunde'] },
  ],
  'a1-3': [
    { heading: 'Bitten formulieren', points: ['ein Fenster', 'ein Stift'] },
    { heading: 'Bitten formulieren', points: ['ein Glas Wasser', 'die Rechnung'] },
    { heading: 'Bitten formulieren', points: ['die Uhrzeit', 'die Tür'] },
    { heading: 'Bitten formulieren', points: ['ein Handy', 'das Licht'] },
    { heading: 'Bitten formulieren', points: ['ein Buch', 'ein Platz am Fenster'] },
    { heading: 'Bitten formulieren', points: ['eine Tasse Kaffee', 'der Stadtplan'] },
    { heading: 'Bitten formulieren', points: ['das Salz', 'die Speisekarte'] },
    { heading: 'Bitten formulieren', points: ['ein Formular', 'ein Kugelschreiber'] },
  ],
  'a2-1': [
    { heading: 'Fragen zur Person', points: ['Wohnort', 'Beruf', 'Familie', 'Hobby'] },
    { heading: 'Fragen zur Person', points: ['Sprachen', 'Tagesablauf', 'Urlaub', 'Essen'] },
    { heading: 'Fragen zur Person', points: ['Wochenende', 'Haustier', 'Sport', 'Musik'] },
    { heading: 'Fragen zur Person', points: ['Schule', 'Freunde', 'Einkaufen', 'Wetter'] },
    { heading: 'Fragen zur Person', points: ['Geburtstag', 'Lieblingsessen', 'Arbeit', 'Reisen'] },
    { heading: 'Fragen zur Person', points: ['Wohnung', 'Verkehrsmittel', 'Fernsehen', 'Deutschkurs'] },
  ],
};

/** The shipped sheet of a part for a day, or null when the part's sheet is written by the tutor. */
export function fixedSheet(partId: string, day = Math.floor(Date.now() / 86_400_000)): ExamSheet | null {
  const pool = FIXED_SHEETS[partId];
  if (!pool) return null;
  return pool[((day % pool.length) + pool.length) % pool.length];
}


export const examFor = (level: Level): ExamSpec => EXAMS[level];

export const partById = (id: string): ExamPart | undefined => Object.values(EXAMS).flatMap((e) => e.parts).find((p) => p.id === id);

// ------------------------------------------------------------------------------------------------
// the task sheet, read by shape
// ------------------------------------------------------------------------------------------------

const HEADING_LINE = /^(?:thema|situation|these|topic|aufgabe|titel)\s*[:：]\s*(.+)$/i;
const POINT_LINE = /^(?:[-*•–]|\d+[.)]|karte\s*\d+\s*[:：]|bild\s*\d+\s*[:：]|folie\s*\d+\s*[:：]|punkt\s*\d+\s*[:：])\s*(.+)$/i;
const LABEL_ONLY = /^(?:punkte|leitpunkte|karten|bilder|folien|argumente|pro|contra|dafür|dagegen)\s*[:：]?\s*$/i;

const clean = (s: string) =>
  s
    .replace(/\*\*|__|`|\*/g, '')
    .replace(/^#+\s*/, '')
    .trim()
    .replace(/\s+/g, ' ');

/** How many points a kind's sheet carries: two cards or pictures, four points otherwise. */
export const SHEET_POINTS: Record<ExamPartKind, number> = { intro: 0, cards: 2, request: 2, monologue: 4, plan: 4, talk: 4 };

/**
 * The sheet from the tutor's lines: a heading (labelled, or the first line) and the points; a translation in
 * brackets after a point is dropped, a lone word is kept only as a card or a picture. Null when thin.
 */
export function parseExamSheet(raw: string, kind: ExamPartKind = 'monologue'): ExamSheet | null {
  const lines = raw
    .split(/\r?\n/)
    .map(clean)
    .filter((l) => l && !LABEL_ONLY.test(l));
  const max = Math.max(SHEET_POINTS[kind], 2) + 2;
  const single = kind === 'cards' || kind === 'request';
  let heading = '';
  const points: string[] = [];
  const add = (raw: string) => {
    const point = raw
      .replace(/\s*\([^()]*\)\s*$/, '')
      .trim()
      .replace(/[.;]+$/, '');
    if (!point || (!single && !/\s/.test(point) && !/[?!]$/.test(point))) return; // "Wann?" stays, a half-written word goes
    if (points.length < max) points.push(point);
  };
  const GENERIC = /^(?:sprechen|aufgabenblatt|aufgabe|teil\s*\d|prüfung|goethe)/i;
  for (const line of lines) {
    const h = HEADING_LINE.exec(line);
    if (h && (!heading || GENERIC.test(heading))) {
      heading = h[1].trim();
      continue;
    }
    const p = POINT_LINE.exec(line);
    if (p) {
      // "- Thema: Einkaufen" under a title line "Sprechen - Teil 1": the labelled line is the heading
      const inner = HEADING_LINE.exec(p[1].trim());
      if (inner && (!heading || GENERIC.test(heading))) {
        heading = inner[1].trim();
        continue;
      }
      add(p[1]);
      continue;
    }
    if (!heading) heading = line.replace(/[.;]+$/, '');
    else if (points.length === 0 && line.length < 90) add(line);
  }
  if (!heading || points.length < 2) return null;
  return { heading, points: points.slice(0, Math.max(SHEET_POINTS[kind], 2) + (single ? 0 : 1)) };
}

/** The sheet is complete once the kind's points are there and the last line is closed; `stopWhen` for the generation. */
export const sheetComplete = (full: string, kind: ExamPartKind = 'monologue'): boolean => {
  if (!/\n\s*$/.test(full)) return false;
  const sheet = parseExamSheet(full, kind);
  return Boolean(sheet && sheet.points.length >= Math.max(SHEET_POINTS[kind], 2));
};

// ------------------------------------------------------------------------------------------------
// the rating, read by shape
// ------------------------------------------------------------------------------------------------

const SCORE_LINE = /^[^:：\d]{2,40}[:：]\s*([0-4])\b/;
const BETTER_LINE = /^(?:besser|better|korrigiert|korrektur|verbesserung|corrected|correction|mieux|corrigé|mejor|corregido|meglio|corretto|melhor|corrigido|daha iyi|düzeltilmiş|lepiej|poprawione|лучше|исправлено|краще|виправлено|أفضل|مصحح|更好|改进|更正)\s*[:：]\s*(.+)$/i;
const TIP_LINE = /^(?:tipp|tip|conseil|consejo|consiglio|dica|ipucu|i̇pucu|wskazówka|совет|порада|نصيحة|建议|提示)\s*[:：]\s*(.+)$/i;
const COMMENT_LINE = /^(?:kommentar|comment|commentaire|comentario|commento|comentário|yorum|komentarz|комментарий|коментар|تعليق|评语|评论)\s*[:：]\s*(.*)$/i;
const ENDS_SENTENCE = /[.!?…»“”"']\s*$/;

interface RatingRead {
  rating: ExamRating | null;
  /** Which of the free lines were found under their label (the rest were taken by position). */
  labelled: { comment: boolean; tip: boolean; better: boolean };
}

function readRating(raw: string): RatingRead {
  const lines = raw.split(/\r?\n/).map(clean).filter(Boolean);
  const scores: number[] = [];
  const rest: string[] = [];
  for (const line of lines) {
    const m = scores.length < 4 ? SCORE_LINE.exec(line) : null;
    if (m) scores.push(Number(m[1]));
    else rest.push(line);
  }
  const labelled = { comment: false, tip: false, better: false };
  if (scores.length < 4) return { rating: null, labelled };
  let comment = '';
  let tip = '';
  let better = '';
  const free: string[] = [];
  for (const line of rest) {
    const b = BETTER_LINE.exec(line);
    const tp = TIP_LINE.exec(line);
    const cm = COMMENT_LINE.exec(line);
    if (b && !better) {
      better = b[1].trim();
      labelled.better = true;
    } else if (tp && !tip) {
      tip = tp[1].trim();
      labelled.tip = true;
    } else if (cm) {
      if (cm[1].trim() && !comment) {
        comment = cm[1].trim();
        labelled.comment = true;
      }
    } else if (/\s/.test(line) || /[.!?]/.test(line)) free.push(line); // a lone word is a label still being written
  }
  // without labels the model still tends to write comment, tip, sentence in that order
  if (!comment) comment = free.shift() ?? '';
  if (!tip && free.length) tip = free.shift() ?? '';
  if (!better && free.length) better = free.shift() ?? '';
  return {
    rating: {
      scores: { fulfilment: scores[0], coherence: scores[1], vocabulary: scores[2], structures: scores[3] },
      comment,
      tip,
      better: better.replace(/^[„"“]|[“"”]$/g, '').trim(),
    },
    labelled,
  };
}

/** The four scores in the order of the criteria, then comment, tip and improved sentence; null without four scores. */
export const parseExamRating = (raw: string): ExamRating | null => readRating(raw).rating;

/** True when the rating has all three free lines; a model that stopped after the scores is asked to go on. */
export const ratingHasFeedback = (r: ExamRating): boolean => Boolean(r.comment && r.tip && r.better);

/**
 * The answer's beginning for a second run when the model stopped after the scores: its own four score lines and
 * the label of the first free line, so it has to continue with the comment.
 */
export const ratingPrefill = (r: ExamRating): string => `Erfüllung: ${r.scores.fulfilment}\nKohärenz: ${r.scores.coherence}\nWortschatz: ${r.scores.vocabulary}\nStrukturen: ${r.scores.structures}\nKommentar:`;

/**
 * Stop the generation once all three free lines stand under their labels and the last one has reached the end
 * of a sentence: a label still being written ("Kom") or a half sentence must not pass.
 */
export const ratingComplete = (full: string): boolean => {
  const { rating, labelled } = readRating(full);
  if (!rating || !labelled.comment || !labelled.tip || !labelled.better) return false;
  return Boolean(rating.comment && rating.tip && rating.better.split(/\s+/).length >= 4 && (ENDS_SENTENCE.test(full) || /\n\s*$/.test(full)));
};

// ------------------------------------------------------------------------------------------------
// what the app measures itself
// ------------------------------------------------------------------------------------------------

export const wordsOf = (text: string): number => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Words a minute over the turns of a part; 0 without speech. */
export function wordsPerMinute(turns: ExamTurn[]): number {
  const words = turns.reduce((n, t) => n + wordsOf(t.said), 0);
  const seconds = turns.reduce((n, t) => n + t.seconds, 0);
  return seconds > 0 ? Math.round((words / seconds) * 60) : 0;
}

/** Words a minute that earn 4, 3, 2 and 1 at the level; natural speech runs at 120-160, an exam candidate below. */
const PACE: Record<Level, [number, number, number, number]> = {
  A1: [80, 60, 40, 20],
  A2: [90, 65, 45, 25],
  B1: [105, 80, 55, 30],
  B2: [115, 90, 65, 35],
  C1: [125, 95, 70, 40],
  C2: [130, 100, 75, 40],
};

/**
 * Fluency 0-4 from pace and length: a candidate who says far too little cannot score above 1 however fast,
 * one who fills the time at the level's pace scores 4.
 */
export function fluencyScore(level: Level, part: ExamPart, turns: ExamTurn[]): number {
  const words = turns.reduce((n, t) => n + wordsOf(t.said), 0);
  if (words === 0) return 0;
  const wpm = wordsPerMinute(turns);
  const bands = PACE[level];
  let score = wpm >= bands[0] ? 4 : wpm >= bands[1] ? 3 : wpm >= bands[2] ? 2 : wpm >= bands[3] ? 1 : 0;
  if (words < part.minWords / 2) score = Math.min(score, 1);
  else if (words < part.minWords) score = Math.min(score, 2);
  return score;
}

/** A part's points out of 100: the four rated criteria and fluency, 4 each. */
export function partPercent(result: ExamPartResult): number | null {
  if (!result.rating) return null;
  const sum = EXAM_CRITERIA.reduce((n, k) => n + result.rating!.scores[k], 0) + result.fluency;
  return Math.round((sum / (MAX_SCORE * 5)) * 100);
}

/** The exam's points out of 100: the mean of the rated parts; null before any part is rated. */
export function examPercent(results: ExamPartResult[]): number | null {
  const rated = results.map(partPercent).filter((p): p is number => p !== null);
  if (!rated.length) return null;
  return Math.round(rated.reduce((a, b) => a + b, 0) / rated.length);
}

export const passed = (percent: number): boolean => percent >= PASS_PERCENT;

/** The speaker labels of a dialogue line (Prüfer:, Kandidat:) stripped, for what the voice reads. */
export const spoken = (line: string): string => line.replace(/^[A-ZÄÖÜ][\wäöüß]*\s*[:：]\s*/, '').trim();
