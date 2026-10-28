// Every prompt the app sends to the model. Wherever the model was trained on a phrasing (grammar cards,
// corrections, vocabulary lists, role-play turns, session plans), the app uses that phrasing: a small model
// follows a format it has seen far better than a described one.

import modelInfo from '../data/model.json';

import { atLeast, levelSentence, type Level } from './levels';
import { PROMPT_TEXTS } from './promptTexts';
import type { Lang } from './route';

/** The system prompt the model was trained with (the SYSTEM block of its release's Modelfile), via src/data/model.json. */
export const DEFAULT_SYSTEM_PROMPT: string = modelInfo.system_prompt;

/** Token budgets per kind of turn: long enough to finish (the release check's not_truncated), short enough to stay quick. */
export const BUDGET = {
  answer: 420,
  correction: 260,
  /** A correction at B2 and above: the explanations run longer (reported speech, register, several examples). */
  correctionUpper: 340,
  textCorrection: 520,
  explain: 220,
  vocab: 560,
  examples: 320,
  roleplay: 90,
  plan: 240,
  translate: 120,
  modelAnswer: 520,
  phrases: 360,
  hint: 140,
  /** A situation card, a writing task, a grammar card, a topic list: labelled lines, read by shape. */
  sceneCard: 320,
  writeTask: 300,
  grammarCard: 420,
  topics: 120,
  /** Practising together: five numbered questions with glosses; one line of four Taboo words. */
  talk: 260,
  taboo: 40,
} as const;

const T = (lang: Lang) => PROMPT_TEXTS[lang] ?? PROMPT_TEXTS.en;

/** The budget for correcting one sentence at the learner's level. */
export const correctionBudget = (level: Level): number => (atLeast(level, 'B2') ? BUDGET.correctionUpper : BUDGET.correction);

/** A free question, with the learner's level stated the way the training prompts state it. */
export function askPrompt(question: string, level: Level, lang: Lang): string {
  const trimmed = question.trim();
  return `${trimmed}${/[.?!]$/.test(trimmed) ? '' : '?'} ${levelSentence(level, lang)}`;
}

/** One sentence to correct: the phrasing of the model card example and the correction training rows. */
export function correctSentencePrompt(sentence: string, lang: Lang): string {
  return T(lang).correctSentence(sentence.trim());
}

/** A longer text (several sentences, a letter): corrected text first, then the mistakes, then one tip. */
export function correctTextPrompt(text: string, level: Level, lang: Lang): string {
  return T(lang).correctText(text.trim(), level);
}

/** Why a drill answer was wrong; the correct answer comes from the engines or the lexicon, never the model. */
export function explainMistakePrompt(task: string, answer: string, correct: string, lang: Lang): string {
  return T(lang).explainMistake(task, answer, correct);
}

/** A themed word list: the vocab-list scenario of the release check. */
export function vocabListPrompt(topic: string, level: Level, lang: Lang, count = 8): string {
  return T(lang).vocabList(topic, level, count);
}

/** More about one word from the lexicon. */
export function wordPrompt(word: string, level: Level, lang: Lang): string {
  return T(lang).word(word, level);
}

// ------------------------------------------------------------------------------------------------
// grammar: the four card shapes the model was trained on
// ------------------------------------------------------------------------------------------------

export function grammarExplainPrompt(title: string, level: Level, lang: Lang): string {
  return T(lang).grammarExplain(title, level);
}

export function grammarContrastPrompt(items: string[], level: Level, lang: Lang): string {
  return T(lang).grammarContrast(items, level);
}

export function grammarCheckPrompt(sentence: string, lang: Lang): string {
  return T(lang).grammarCheck(sentence.trim());
}

export function grammarExamplesPrompt(title: string, lang: Lang): string {
  return T(lang).grammarExamples(title);
}

// ------------------------------------------------------------------------------------------------
// translation, writing, scenes
// ------------------------------------------------------------------------------------------------

/** The model card: asked to translate, the model translates and then explains; ask for the translation alone. */
export function translatePrompt(text: string, lang: Lang): string {
  return T(lang).translate(text.trim());
}

/** A line of German into the learner's language (English by default; a role-play line at B1/B2, where glosses are off). */
export function glossPrompt(german: string, lang: Lang = 'en'): string {
  return T(lang).gloss(german.trim());
}

export function modelAnswerPrompt(task: string, level: Level, words: [number, number], register: 'formal' | 'informal'): string {
  return `Write a model answer in German for this ${register} writing task at ${level} level, ${words[0]}-${words[1]} words. Only the text of the email, no explanation. Task: ${task}`;
}

export function phrasesPrompt(situation: string, level: Level, lang: Lang): string {
  return T(lang).phrases(situation, level);
}

/** A suggested next line for the learner in a role-play: help without breaking the scene. */
export function suggestReplyPrompt(situation: string, learnerRole: string, lastLine: string, level: Level): string {
  return `I'm practising a role-play: ${situation}. I am ${learnerRole}. The other person just said: "${lastLine}" Give me one short reply in German I could say (${level} level), then the English translation in parentheses. Nothing else.`;
}

// ------------------------------------------------------------------------------------------------
// authoring: content the model writes for the app (a scene card, a writing task, a grammar card, topics).
// Each asks for labelled lines and shows one worked example; a second wording exists for the retry, since
// greedy decoding gives the same answer to the same prompt.
// ------------------------------------------------------------------------------------------------

const SCENE_EXAMPLE = [
  'Situation (German): Ein Zugticket am Schalter kaufen',
  'Situation (English): buying a train ticket at the counter',
  'Place: Bahnhof',
  'Their role (German): die Mitarbeiterin',
  'Their role (English): the ticket clerk',
  'My role (German): der Reisende',
  'My role (English): the traveller',
  'Register: Sie',
  'Facts:',
  '- Preis | Price | 29 Euro einfache Fahrt',
  '- Abfahrt | Departure | 10:15 Uhr, Gleis 4',
  '- Umsteigen | Change | in Hannover',
  'Their first line (German): Guten Tag! Wohin möchten Sie fahren?',
  'Their first line (English): Hello! Where would you like to go?',
].join('\n');

/**
 * The first label of a scene card, placed after the assistant tag (`GenerateOptions.prefill`). Without it the phone
 * model, told that it plays the other person, answers with the opening line alone or with a whole dialogue; with
 * it every draft in the local corpus is a card.
 */
export const SCENE_PREFILL = 'Situation (German):';
/** The first label of a writing task card; without it the model sets the task as a Markdown page or as the German Aufgabe alone. */
export const TASK_PREFILL = 'Title:';

/** A role-play situation card for a learner's own idea; `variant` 1 words the request differently for the retry. */
export function sceneCardPrompt(description: string, level: Level, variant = 0): string {
  const d = description.trim().replace(/[.!?]+$/, '');
  // "Design a role-play" makes the model write its own card with a vocabulary list and phrases and no facts, and
  // "you play the other person" alone makes v23 start the role-play: "fill in a situation card for a lesson" with
  // the things not to add keeps it to the labelled lines. Who speaks first has to be said twice (in the ask and
  // in the label "Their first line"), or the model writes the customer's, tenant's or employee's line as the
  // opening, and sometimes swaps the roles. Tried against the model on the Mac, with SCENE_PREFILL.
  const ask =
    variant === 0
      ? `Fill in a situation card for a German lesson at ${level} level. Scene: ${d}. My role is the learner, their role is the other person, who speaks first. Same labels as the example, one per line.`
      : `Make a situation card for a role-play in German at ${level} level about this: ${d}. You are the other person and speak first, I am the learner. Same labels as the example, one per line.`;
  return [
    ask,
    `Answer with exactly these lines and nothing else: no headings, no vocabulary list, no phrases, no tips, no dialogue. Facts are three lines "German label | English label | value", each value under eight words, with concrete numbers (prices, times, quantities, names). Their first line is what the other person says to me to start: German, one or two sentences, ending with a question.`,
    '',
    'Example for "buying a train ticket":',
    SCENE_EXAMPLE,
  ].join('\n');
}

const TASK_EXAMPLE = [
  'Title: An email to a hotel',
  'Task (English): Write a short email to the Hotel Seeblick: you want a single room for two nights from Friday. Ask for the price and whether breakfast is included.',
  'Task (German): Schreib eine kurze E-Mail an das Hotel Seeblick: Du möchtest ein Einzelzimmer für zwei Nächte ab Freitag. Frag nach dem Preis und ob das Frühstück inklusive ist.',
  'Content points:',
  '- the room and the dates | Einzelzimmer, Zimmer, zwei Nächte, Freitag',
  '- ask for the price | Preis, kostet, kosten',
  '- ask about breakfast | Frühstück, inklusive',
].join('\n');

/**
 * A writing task in the shape of the exam writing parts: title, task in both languages, content points with key
 * words. "Writing task" alone makes the model write the exam's German Aufgabe and then the learner's letter as
 * well; naming the labels and saying "do not write the message itself" keeps it to the card. The retry differs by
 * level, from what the local drafts showed: at A1/A2 the same card without the label list, at B1/B2 the task the
 * exam way (German only, "point | key words" lines), which the reader also accepts.
 */
export function writeTaskPrompt(topic: string, level: Level, register: 'formal' | 'informal', words: [number, number], variant = 0): string {
  const t = topic.trim().replace(/[.!?]+$/, '');
  const kind = register === 'formal' ? 'a formal email or letter (Sie)' : 'an informal message or email to a friend (du)';
  const card = `Make a writing task card for a German learner at ${level} level: the topic is ${t}, ${kind}, ${words[0]}-${words[1]} words, three content points. Same labels as the example, one per line`;
  // both wordings name the labels: without them v23 writes the German Aufgabe alone (tried on the Mac, with TASK_PREFILL)
  const ask =
    variant === 0
      ? `${card}: Title, Task (English), Task (German), Content points.`
      : `Write the card for a writing task for a German learner at ${level} level about ${t}: ${kind}, ${words[0]}-${words[1]} words, three content points. Use the labels of the example, one per line: Title, Task (English), Task (German), Content points. Write only the card, not the text the learner should write.`;
  return [
    ask,
    'Answer with exactly these lines and nothing else. Do not write the email or message itself, no model text, no useful phrases, no word bank, no tips. Each content point is one line "point in English | German key words a learner would use, comma-separated".',
    '',
    'Example for "a hotel booking":',
    TASK_EXAMPLE,
  ].join('\n');
}

const READING_EXAMPLE = [
  'Titel: Ein Tag im Park',
  '',
  'Am Samstag gehen Lena und ihr Bruder Tim in den Park. Das Wetter ist schön und warm. Sie spielen Fußball und essen ein Eis. Um fünf Uhr fahren sie mit dem Bus nach Hause.',
  '',
  'Frage 1: Wann gehen Lena und Tim in den Park?',
  'a) Am Samstag',
  'b) Am Montag',
  'c) Am Abend',
  'Antwort: a',
  'Frage 2: Was essen sie?',
  'a) Pizza',
  'b) Ein Eis',
  'c) Brot',
  'Antwort: b',
  'Frage 3: Wie fahren sie nach Hause?',
  'a) Mit dem Auto',
  'b) Mit dem Fahrrad',
  'c) Mit dem Bus',
  'Antwort: c',
].join('\n');

export const READING_PREFILL = 'Titel:';

/**
 * A reading text with three multiple-choice questions, read by shape (src/harness/reading.ts). The text is in
 * German whatever the learner's language; the labels are German too, so the model keeps to one language.
 */
export function readingPrompt(topic: string, level: Level, words: [number, number], variant = 0): string {
  const t = topic.trim().replace(/[.!?]+$/, '');
  const ask =
    variant === 0
      ? `Write a reading text in German for a German learner at ${level} level about ${t}: ${words[0]}-${words[1]} words, everyday language, in two or three short paragraphs, with a title. Then write exactly three comprehension questions in German about the text, each with three options a), b), c) and the right letter on a line "Antwort:".`
      : `Make a reading exercise for a German learner at ${level} level on the topic ${t}. First a title line "Titel:", then a German text of ${words[0]}-${words[1]} words in two or three paragraphs, then three questions in German labelled "Frage 1:", "Frage 2:", "Frage 3:", each followed by three options a), b), c) and a line "Antwort:" with the letter of the right option.`;
  return [ask, 'Use exactly the layout of the example and nothing else: no translation, no vocabulary list, no explanations.', '', 'Example (a shorter text, for A1):', READING_EXAMPLE].join('\n');
}

const CARD_EXAMPLE = [
  'Title (English): Perfekt with haben or sein?',
  'Title (German): Perfekt mit haben oder sein?',
  'Rule (English): Most verbs form the Perfekt with haben. Verbs of movement from A to B (gehen, fahren, kommen) and of a change of state (aufwachen, einschlafen, sterben), plus sein, werden and bleiben, take sein.',
  'Rule (German): Die meisten Verben bilden das Perfekt mit haben. Verben der Bewegung von A nach B und der Zustandsänderung sowie sein, werden und bleiben nehmen sein.',
  'Examples:',
  '- Ich habe gestern Pizza gegessen. | I ate pizza yesterday.',
  '- Wir sind nach Berlin gefahren. | We drove to Berlin.',
  '- Sie ist um sieben Uhr aufgewacht. | She woke up at seven.',
  'Pitfall:',
  '- Ich habe nach Hause gegangen. | Ich bin nach Hause gegangen. | gehen is movement from A to B, so it takes sein.',
].join('\n');

/**
 * A grammar card on a topic of the learner's choice; the router attaches the nearest rule note. "Write a grammar
 * card" alone gets the model's own card (arrows instead of translations, a one-line pitfall), so the labels are
 * named; the retry asks for a reference card, which the model also lays out in labelled lines.
 */
export function grammarCardPrompt(topic: string, level: Level, variant = 0): string {
  const t = topic.trim().replace(/[.!?]+$/, '');
  const ask =
    variant === 0
      ? `Make a grammar card for a German learner at ${level} level on this topic: ${t}. Same labels as the example, one per line: Title (English), Title (German), Rule (English), Rule (German), Examples, Pitfall.`
      : `Explain this German grammar topic as a short reference card for a ${level} learner: ${t}. Keep the rule to two or three sentences.`;
  return [
    ask,
    'Answer with exactly these lines and nothing else: no vocabulary list, no tips, no extra sections. The rule is two or three sentences; three examples as "German sentence | English translation"; one pitfall as "wrong sentence | right sentence | why".',
    '',
    'Example for "Perfekt with haben or sein":',
    CARD_EXAMPLE,
  ].join('\n');
}

/**
 * Vocabulary topics for a level, beyond the ones the app already offers. "Vocabulary topics" gets word lists;
 * "lesson topics in English" gets a numbered list of topic names, often with a German noun in brackets after
 * each, which the reader drops. Two more than needed are asked for, since one or two repeat the list given.
 */
export function topicsPrompt(level: Level, exclude: string[], n = 6, variant = 0): string {
  const skip = exclude.length ? ` Skip these, which I already have: ${exclude.join(', ')}.` : '';
  return variant === 0
    ? `List ${n + 2} lesson topics in English for ${level} German vocabulary, one per line, two to four words each, like "at the doctor's" or "the weather".${skip} Only the English topic names, no German, no explanations.`
    : `What are ${n + 2} good themes for learning German words at ${level} level?${skip} One theme per line, two to four English words each (like "at the doctor's" or "the weather"), only the English names, no German words, no explanations.`;
}

// ------------------------------------------------------------------------------------------------
// session planning (the model chooses and orders task types; the app builds and grades every task)
// ------------------------------------------------------------------------------------------------

export const PLANNER_SYSTEM = 'You are a German tutor planning a short practice session. Answer in English with a numbered list only.';

export function plannerPrompt(goal: string, types: string[], n: number, learnerLang: Lang): string {
  return [
    `The learner says: "${goal}"${learnerLang === 'de' ? ' (the learner writes in German)' : ''}`,
    `Pick ${n} of these task types for the learner and order them easiest first: ${types.join(', ')}.`,
    'Mix the kinds: include at least one of scene, writing or words.',
    `Write exactly ${n} lines, one per task, in the form "type - because <why it helps this learner>". Nothing else: no exercises, no explanations, no sub-points.`,
    '',
    // one worked example: a small model follows a shown format far better than a described one
    'Example for a learner who says "I\'m at B2 level and I want to write better emails at work.":',
    '1. words - because emails at work need precise vocabulary',
    '2. grammar - because formal emails use the passive and Konjunktiv II',
    '3. writing - because that is what you asked for',
  ].join('\n');
}

// ------------------------------------------------------------------------------------------------
// practising together: the prompt texts live next to their parsers in together.ts
// ------------------------------------------------------------------------------------------------

export { tabooPrompt, talkPrompt } from './together';
