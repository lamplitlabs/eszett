// Practising together: two people share one phone, and the app facilitates. Talking points (a German question,
// its gloss, three key words from the lexicon, whose turn it is), a Taboo game, a two-player quiz over the
// drills, and a chain story the tutor checks line by line. Everything here is pure and serialisable, so a
// session could later be shared between two phones; the screens under src/app/together render these states.
//
// The bundled content covers eight topics at four levels (src/data/together.json). The model only adds to it:
// questions for a topic of the players' own, and the forbidden words of a Taboo card. Both come with a parser
// and a bundled fallback, like every other authoring task in this app.

import data from '../data/together.json';
import type { AppLang } from '../i18n/languages';
import { LANGUAGE_NAMES_EN } from '../i18n/languages';
import type { DiffOp } from './diff';
import { buildDrillSet, pickNouns, type Drill, type DrillCategory, type Rng } from './drills';
import { normalise } from './engines';
import { GENUS_ARTICLE, type Article, type LexiconIndex, type LexNoun } from './lexicon';
import { LEVELS, levelIndex, type Level } from './levels';
import { parsePhrases, phrasesComplete } from './parse';
import { translationTarget, type Lang } from './route';
import type { RuleHit } from './rules';

// ------------------------------------------------------------------------------------------------
// talking points
// ------------------------------------------------------------------------------------------------

export const TALK_TOPICS = ['everyday', 'food', 'travel', 'work', 'home', 'people', 'freetime', 'health'] as const;
export type TalkTopic = (typeof TALK_TOPICS)[number];

/** The gloss languages that ship with the bundled points (the ones the model glosses in, see route.ts). */
export type GlossLang = 'en' | 'fr' | 'es' | 'it';

export interface TalkPoint {
  topic: TalkTopic | 'custom';
  level: Level;
  /** The German question one player asks the other. */
  q: string;
  /** Glosses by language; English is always there for bundled points, model-written points carry one. */
  gloss: Partial<Record<GlossLang, string>>;
  /** Lemmas of nouns worth having ready, looked up in the lexicon at render time. */
  words: string[];
}

interface BundledPoint {
  topic: string;
  level: string;
  q: string;
  en: string;
  fr: string;
  es: string;
  it: string;
  words: string[];
}

const BUNDLED: TalkPoint[] = (data as BundledPoint[]).map((p) => ({
  topic: p.topic as TalkTopic,
  level: p.level as Level,
  q: p.q,
  gloss: { en: p.en, fr: p.fr, es: p.es, it: p.it },
  words: p.words,
}));

/** The bundled points for a topic at a level (three each), or every level up to it when `upTo` is set. */
export function talkPoints(topic: TalkTopic, level: Level, upTo = false): TalkPoint[] {
  const max = levelIndex(level);
  return BUNDLED.filter((p) => p.topic === topic && (upTo ? levelIndex(p.level) <= max : p.level === level));
}

/**
 * The gloss to show under a question in the app language: none in German, the bundled one when the app language
 * has it, otherwise English (which the screen may translate on the phone when the learner turned that on).
 */
export function pointGloss(point: TalkPoint, lang: AppLang): { text: string; lang: GlossLang } | null {
  if (lang === 'de') return null;
  const target: GlossLang = lang === 'fr' || lang === 'es' || lang === 'it' ? lang : 'en';
  const own = point.gloss[target];
  if (own) return { text: own, lang: target };
  return point.gloss.en ? { text: point.gloss.en, lang: 'en' } : null;
}

export interface KeyWord {
  lemma: string;
  /** The article when the lexicon knows the noun's gender; plural-only words ("Eltern") have none. */
  article: Article | null;
  plural: string | null;
  /** The English meaning from the lexicon, for `wordMeaning` to translate; null for words it only knows the gender of. */
  meaning: string | null;
  noun: LexNoun | null;
}

/** The point's key words with what the lexicon knows about them (the full lexicon knows far more than the core). */
export function keyWords(point: TalkPoint, lex: LexiconIndex): KeyWord[] {
  return point.words.map((lemma) => {
    const noun = lex.noun(lemma) ?? null;
    const articles = lex.articlesOf(lemma);
    // a compound the lexicon does not list takes the article of its head (Vier-Tage-Woche → die Woche)
    const head = articles.length ? undefined : lex.compoundHead(lemma);
    return {
      lemma,
      article: noun ? GENUS_ARTICLE[noun.genus] : articles.length === 1 ? articles[0] : (head?.article ?? null),
      plural: noun?.plural[0] ?? lex.pluralsOfLemma(lemma)[0] ?? head?.plural ?? null,
      meaning: noun?.meaning ?? null,
      noun,
    };
  });
}

/** Who asks the n-th question: the players alternate, so both ask and both answer. */
export const askerOf = (index: number): 0 | 1 => (index % 2 === 0 ? 0 : 1);

/**
 * Discussion questions for the players' own topic, in the shape the phrases parser already reads
 * ("1. German question? (translation)"). The translation is asked for in the gloss language of the app language
 * (French, Spanish, Italian) and in English otherwise. The retry rewords the request, since greedy decoding
 * repeats an answer to the same prompt.
 */
export function talkPrompt(topic: string, level: Level, lang: Lang, n = 5, variant = 0): string {
  const to = LANGUAGE_NAMES_EN[translationTarget(lang)];
  const t = topic.replace(/\s+/g, ' ').trim();
  return variant === 0
    ? `Two German learners at ${level} level are practising speaking together. Write ${n} discussion questions in German about this topic: ${t}. Use du. Number them 1 to ${n}, one per line, each followed by its ${to} translation in parentheses. Nothing else: no answers, no vocabulary, no tips.`
    : `Give me ${n} conversation questions in German (${level} level, using du) that two people can ask each other about: ${t}. One per line, numbered, with the ${to} translation in parentheses after each question. Only the questions.`;
}

const QUESTION_WORD = /^(wann|was|wo|wohin|woher|wie|wer|wen|wem|wessen|warum|wieso|weshalb|welche[rsnm]?|womit|wofür|worüber|wovon|woran|worauf|wozu)\b/i;
const VERB_FIRST = /^(bist|hast|kannst|magst|möchtest|würdest|gehst|isst|trinkst|wohnst|arbeitest|lernst|sprichst|findest|glaubst|denkst|kennst|weißt|machst|siehst|liest|hörst|spielst|fährst|kochst|schläfst|gibt|ist|hat|sollte|sollten|gibt|kann|sind|haben|könnt|habt|seid|wart|warst|warum)\b/i;

/**
 * The model's questions as talking points: numbered lines with a German question, its gloss when given. Lines
 * that are not questions (an answer, a tip) are dropped, and so are repeats; `words` are the capitalised nouns
 * the lexicon knows, at most three.
 */
export function parseTalkPoints(text: string, topic: string, level: Level, lex: LexiconIndex | null, n = 5): TalkPoint[] {
  const out: TalkPoint[] = [];
  const seen = new Set<string>();
  for (const item of parsePhrases(text)) {
    let q = item.german.replace(/\s+/g, ' ').trim();
    let english = item.english?.trim() ?? null;
    // the phrases parser leaves a bracketed gloss in place when the question forgot its question mark (and may
    // then have taken the next line for the gloss)
    const inline = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(q);
    if (inline) {
      q = inline[1].trim();
      english = inline[2].trim();
    }
    if (!isQuestion(q) || q.length < 8 || q.length > 160) continue;
    const key = normalise(q);
    if (seen.has(key)) continue;
    seen.add(key);
    const gloss: Partial<Record<GlossLang, string>> = {};
    if (english) gloss.en = english;
    out.push({ topic: 'custom', level, q: q.endsWith('?') ? q : `${q}?`, gloss, words: nounsIn(q, lex) });
    if (out.length >= n) break;
  }
  return out.length ? out : [];
}

const isQuestion = (s: string) => s.endsWith('?') || QUESTION_WORD.test(s) || VERB_FIRST.test(s);

/** The formal pronoun is capitalised anywhere in the sentence, and the lexicon knows it as a word. */
const FORMAL_PRONOUN = /^(Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)$/;

/**
 * Capitalised words the lexicon knows as nouns, at most three. Never the sentence's first word: a question starts
 * with a question word, a verb or a pronoun, and the full lexicon knows most of those as nominalised nouns too
 * ("das Wie", "die Hast", "das Haben").
 */
export function nounsIn(sentence: string, lex: LexiconIndex | null): string[] {
  if (!lex) return [];
  const out: string[] = [];
  const words = sentence.replace(/[?!.,;:"„“”()]/g, ' ').trim().split(/\s+/);
  for (const w of words.slice(1)) {
    if (!/^[A-ZÄÖÜ][a-zäöüß]+$/.test(w) || FORMAL_PRONOUN.test(w)) continue;
    const lemma = lex.noun(w) ? w : (lex.lemmaOfPlural(w) ?? (lex.articlesOf(w).length ? w : null));
    if (!lemma || out.includes(lemma)) continue;
    out.push(lemma);
    if (out.length >= 3) break;
  }
  return out;
}

/** The list is complete once `n` numbered questions with their glosses stand there. */
export const talkComplete = (text: string, n: number) => phrasesComplete(text, n);

// ------------------------------------------------------------------------------------------------
// Taboo: explain the word in German without saying it, or any of the forbidden words
// ------------------------------------------------------------------------------------------------

export interface TabooCard {
  /** The lemma without article. */
  word: string;
  article: Article | null;
  /** English meaning when known, so the guesser's partner can check what the word means. */
  meaning: string | null;
  /** Words the explainer must not say; empty until the model wrote them (the round is still playable). */
  forbidden: string[];
  level: Level;
}

type Bundled = [article: Article, word: string, meaning: string, level: Level, ...forbidden: string[]];

/** Cards with forbidden words written by hand, so the game works before the model is ready. */
const BUNDLED_TABOO: Bundled[] = [
  ['der', 'Hund', 'dog', 'A1', 'Tier', 'bellen', 'Katze', 'Haustier'],
  ['die', 'Katze', 'cat', 'A1', 'Tier', 'miauen', 'Hund', 'Haustier'],
  ['das', 'Brot', 'bread', 'A1', 'Bäcker', 'essen', 'backen', 'Butter'],
  ['der', 'Apfel', 'apple', 'A1', 'Obst', 'rot', 'Baum', 'essen'],
  ['die', 'Schule', 'school', 'A1', 'Lehrer', 'Kinder', 'lernen', 'Klasse'],
  ['das', 'Auto', 'car', 'A1', 'fahren', 'Straße', 'Rad', 'Motor'],
  ['der', 'Zug', 'train', 'A1', 'Bahnhof', 'fahren', 'Gleis', 'Bahn'],
  ['die', 'Küche', 'kitchen', 'A1', 'kochen', 'Herd', 'Essen', 'Raum'],
  ['das', 'Fenster', 'window', 'A1', 'Glas', 'sehen', 'öffnen', 'Haus'],
  ['der', 'Arzt', 'doctor', 'A1', 'krank', 'Krankenhaus', 'Medikament', 'Praxis'],
  ['die', 'Sonne', 'sun', 'A1', 'Himmel', 'warm', 'scheinen', 'hell'],
  ['das', 'Wasser', 'water', 'A1', 'trinken', 'nass', 'Meer', 'Fluss'],
  ['der', 'Winter', 'winter', 'A2', 'kalt', 'Schnee', 'Jahreszeit', 'Dezember'],
  ['die', 'Hochzeit', 'wedding', 'A2', 'heiraten', 'Braut', 'Ring', 'Fest'],
  ['das', 'Geschenk', 'present', 'A2', 'Geburtstag', 'schenken', 'Papier', 'bekommen'],
  ['der', 'Urlaub', 'holiday', 'A2', 'reisen', 'Strand', 'frei', 'Sommer'],
  ['die', 'Bibliothek', 'library', 'A2', 'Bücher', 'lesen', 'leihen', 'leise'],
  ['das', 'Krankenhaus', 'hospital', 'A2', 'krank', 'Arzt', 'Bett', 'Operation'],
  ['der', 'Schlüssel', 'key', 'A2', 'Tür', 'Schloss', 'öffnen', 'verlieren'],
  ['die', 'Wohnung', 'flat', 'A2', 'wohnen', 'Miete', 'Zimmer', 'Haus'],
  ['das', 'Frühstück', 'breakfast', 'A2', 'Morgen', 'essen', 'Brötchen', 'Kaffee'],
  ['der', 'Regenschirm', 'umbrella', 'A2', 'Regen', 'nass', 'aufspannen', 'Wetter'],
  ['die', 'Haltestelle', 'stop', 'A2', 'Bus', 'warten', 'Straßenbahn', 'einsteigen'],
  ['das', 'Wörterbuch', 'dictionary', 'A2', 'Wort', 'nachschlagen', 'Sprache', 'Buch'],
  ['der', 'Umzug', 'move (house)', 'B1', 'Wohnung', 'Kisten', 'umziehen', 'Möbel'],
  ['die', 'Bewerbung', 'application', 'B1', 'Job', 'Lebenslauf', 'schreiben', 'Stelle'],
  ['das', 'Vorstellungsgespräch', 'job interview', 'B1', 'Bewerbung', 'Firma', 'Fragen', 'Chef'],
  ['der', 'Stau', 'traffic jam', 'B1', 'Auto', 'Autobahn', 'warten', 'Verkehr'],
  ['die', 'Verspätung', 'delay', 'B1', 'Zug', 'spät', 'warten', 'pünktlich'],
  ['das', 'Gewitter', 'thunderstorm', 'B1', 'Blitz', 'Donner', 'Regen', 'Wetter'],
  ['der', 'Nachbar', 'neighbour', 'B1', 'wohnen', 'nebenan', 'Haus', 'Tür'],
  ['die', 'Gewohnheit', 'habit', 'B1', 'immer', 'jeden Tag', 'Routine', 'ändern'],
  ['das', 'Ehrenamt', 'volunteering', 'B1', 'freiwillig', 'helfen', 'Geld', 'Verein'],
  ['der', 'Klimawandel', 'climate change', 'B2', 'Erde', 'warm', 'CO2', 'Umwelt'],
  ['die', 'Verantwortung', 'responsibility', 'B2', 'Pflicht', 'Schuld', 'tragen', 'übernehmen'],
  ['das', 'Vertrauen', 'trust', 'B2', 'glauben', 'Freund', 'ehrlich', 'verlassen'],
  ['der', 'Kompromiss', 'compromise', 'B2', 'Streit', 'einigen', 'beide', 'Mitte'],
  ['die', 'Nachhaltigkeit', 'sustainability', 'B2', 'Umwelt', 'Zukunft', 'Ressourcen', 'grün'],
  ['das', 'Vorurteil', 'prejudice', 'B2', 'Meinung', 'Menschen', 'falsch', 'denken'],
  ['der', 'Feierabend', 'end of the working day', 'B2', 'Arbeit', 'Abend', 'frei', 'nach Hause'],
  ['die', 'Gewaltenteilung', 'separation of powers', 'C1', 'Regierung', 'Parlament', 'Gericht', 'Staat'],
  ['der', 'Fachkräftemangel', 'skills shortage', 'C1', 'Arbeit', 'fehlen', 'Ausbildung', 'Wirtschaft'],
  ['das', 'Bruttoinlandsprodukt', 'gross domestic product', 'C1', 'Wirtschaft', 'Wachstum', 'Land', 'Zahl'],
  ['die', 'Pressefreiheit', 'freedom of the press', 'C1', 'Zeitung', 'Journalist', 'Meinung', 'Zensur'],
  ['der', 'Generationenvertrag', 'intergenerational contract', 'C1', 'Rente', 'jung', 'alt', 'zahlen'],
  ['das', 'Ehrenwort', 'word of honour', 'C1', 'versprechen', 'halten', 'glauben', 'Hand'],
  ['die', 'Schadenfreude', 'malicious glee', 'C1', 'lachen', 'Unglück', 'freuen', 'andere'],
  ['der', 'Sachverhalt', 'facts of the matter', 'C1', 'Fall', 'Situation', 'erklären', 'Tatsache'],
  ['das', 'Gewissen', 'conscience', 'C1', 'schlecht', 'Schuld', 'richtig', 'innere Stimme'],
  ['die', 'Zivilcourage', 'moral courage', 'C1', 'mutig', 'helfen', 'eingreifen', 'Öffentlichkeit'],
  ['die', 'Gratwanderung', 'tightrope walk, balancing act', 'C2', 'Balance', 'schwierig', 'Berg', 'zwischen'],
  ['die', 'Zwickmühle', 'dilemma, catch-22', 'C2', 'Dilemma', 'Entscheidung', 'beide', 'Ausweg'],
  ['der', 'Sündenbock', 'scapegoat', 'C2', 'Schuld', 'Opfer', 'verantwortlich', 'Ziege'],
  ['die', 'Vergangenheitsbewältigung', 'coming to terms with the past', 'C2', 'Geschichte', 'Erinnerung', 'Schuld', 'aufarbeiten'],
  ['der', 'Zeitgeist', 'spirit of the age', 'C2', 'Epoche', 'Mode', 'Denken', 'modern'],
  ['die', 'Weltanschauung', 'world view, ideology', 'C2', 'Überzeugung', 'Religion', 'Ideologie', 'Werte'],
  ['der', 'Elfenbeinturm', 'ivory tower', 'C2', 'Wissenschaft', 'Realität', 'Professor', 'abgehoben'],
  ['die', 'Verschlimmbesserung', 'a change for the worse meant as an improvement', 'C2', 'Reform', 'besser', 'schlechter', 'Absicht'],
  ['die', 'Torschlusspanik', 'fear of missing the boat (last-minute panic)', 'C2', 'Angst', 'Alter', 'spät', 'Zeit'],
  ['das', 'Schlupfloch', 'loophole', 'C2', 'Gesetz', 'Steuer', 'Lücke', 'umgehen'],
];

export const TABOO_BUNDLED: TabooCard[] = BUNDLED_TABOO.map(([article, word, meaning, level, ...forbidden]) => ({ word, article, meaning, forbidden, level }));

const upTo = (level: Level) => LEVELS.slice(0, levelIndex(level) + 1);

/**
 * Cards for a round: the bundled ones at or below the level first, shuffled, then nouns from the lexicon
 * without forbidden words (the model fills those in while the players talk; without the model the explainer
 * simply may not say the word).
 */
export function tabooCards(level: Level, lex: LexiconIndex, rng: Rng, n = 12): TabooCard[] {
  const levels = new Set(upTo(level));
  const bundled = rng.shuffle(TABOO_BUNDLED.filter((c) => levels.has(c.level)));
  const taken = new Set(bundled.map((c) => c.word));
  const more = Math.max(0, n - bundled.length);
  const fromLex = more
    ? pickNouns(lex, level, more, rng, taken)
        .filter((x) => x.lemma.length >= 3)
        .map((x): TabooCard => ({ word: x.lemma, article: GENUS_ARTICLE[x.genus], meaning: x.meaning ?? null, forbidden: [], level }))
    : [];
  return [...bundled, ...fromLex].slice(0, n);
}

/** The model names the words a player must not say when explaining this one; a one-line answer. */
export function tabooPrompt(card: TabooCard, variant = 0): string {
  const word = card.article ? `${card.article} ${card.word}` : card.word;
  return variant === 0
    ? `We are playing Taboo in German. One player explains "${word}" without saying it. Name the 4 German words a player would most likely use to explain it, so they can be forbidden. Answer with one line: the four German words separated by commas, nothing else.\n\nExample for "das Auto": fahren, Straße, Rad, Motor`
    : `Which four German words are the most obvious ones when describing "${word}"? For a Taboo card: one line, the four words separated by commas, no translations, no sentences.\n\nExample for "das Auto": fahren, Straße, Rad, Motor`;
}

const ARTICLE_START = /^(der|die|das|ein|eine|einen|einem|einer|eines|den|dem|des)\s+/i;

/**
 * The forbidden words from the model's line: the first line with at least two commas (or a "Forbidden:"/"Tabu:"
 * label), split at commas and slashes, articles and bracketed translations dropped, the card's own word and
 * anything containing it removed. Null when fewer than three words remain.
 */
export function parseTaboo(text: string, card: TabooCard): string[] | null {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\*\*|__|`/g, '').replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
  const labelled = lines.find((l) => /^(forbidden|tabu|taboo|verboten[e]?(?: wörter)?|words?)\s*:/i.test(l));
  const line = (labelled ? labelled.replace(/^[^:]+:\s*/, '') : lines.find((l) => (l.match(/,/g) ?? []).length >= 2)) ?? lines[0] ?? '';
  const own = normalise(card.word);
  const out: string[] = [];
  for (const raw of line.split(/\s*[,;/]\s*|\s+und\s+|\s+oder\s+/)) {
    let w = raw
      .replace(/^\d+[.)]\s*/, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/[.!?"„“”:]/g, '')
      .trim();
    w = w.replace(ARTICLE_START, '').trim();
    if (!w || w.length > 24 || w.split(/\s+/).length > 2) continue;
    const key = normalise(w);
    if (!key || key.includes(own) || own.includes(key) || out.some((o) => normalise(o) === key)) continue;
    // a translation list ("dog, animal, bark") would be useless: at least one German-looking token per word
    if (!/[a-zäöüß]/i.test(w)) continue;
    out.push(w);
    if (out.length >= 4) break;
  }
  return out.length >= 3 ? out : null;
}

/** The answer is complete once a line with four comma-separated items has ended. */
export const tabooComplete = (text: string) => {
  const done = text.slice(0, text.lastIndexOf('\n') + 1);
  return /(?:[^,\n]+,){3}[^,\n]+/.test(done);
};

/** A guessed word matches the card when it is the lemma, with or without article, in any case. */
export function tabooGuessed(card: TabooCard, guess: string): boolean {
  const g = normalise(guess.replace(ARTICLE_START, ''));
  return g.length > 0 && g === normalise(card.word);
}

export const TABOO_SECONDS = 60;

// ------------------------------------------------------------------------------------------------
// chain story: one sentence each, the tutor checks every line
// ------------------------------------------------------------------------------------------------

export const STORY_OPENERS: Record<Level, string[]> = {
  A1: ['Es ist Montag. Anna steht um sieben Uhr auf.', 'Heute ist Samstag und die Sonne scheint.', 'Tom geht in den Supermarkt.', 'Lisa hat einen kleinen Hund.'],
  A2: ['Gestern hat Paul seinen Schlüssel verloren.', 'Am Wochenende wollten wir ans Meer fahren.', 'Im Zug saß eine Frau mit einem großen Koffer.', 'Der Bäcker an der Ecke hatte heute ein Schild im Fenster.'],
  B1: ['Als ich die Tür öffnete, stand niemand davor.', 'Niemand im Büro wusste, woher das Paket kam.', 'Seit drei Tagen regnete es ohne Pause.', 'Meine Nachbarin hatte plötzlich einen Plan.'],
  B2: ['Die Stadt hatte beschlossen, alle Autos zu verbannen – ab morgen.', 'Obwohl alles geplant war, lief an diesem Morgen nichts wie erwartet.', 'In dem alten Brief stand nur ein einziger Satz.', 'Hätte sie den Zug nicht verpasst, wäre nichts davon passiert.'],
  C1: [
    'Die Pressemitteilung, die am Morgen verschickt worden war, enthielt einen Satz, den niemand autorisiert hatte.',
    'Angeblich sei der Vertrag längst unterschrieben, hieß es – doch das Original blieb verschwunden.',
    'Wäre der Gutachter an jenem Abend nicht noch einmal ins Archiv zurückgekehrt, hätte die Stadt den Fehler nie bemerkt.',
    'Je länger die Sitzung dauerte, desto deutlicher wurde, dass keiner der Anwesenden die Akte tatsächlich gelesen hatte.',
  ],
  C2: [
    'Dass ausgerechnet der Mann, dessen Gutachten den Abriss erst ermöglicht hatte, nun gegen das Vorhaben klagte, überraschte in der Stadt niemanden, der ihn kannte.',
    'Kaum war das Urteil verkündet, kursierte im Flur eine Lesart, die mit dem, was die Vorsitzende tatsächlich gesagt hatte, nur noch entfernt zu tun hatte.',
    'Es war ihr nie um das Geld gegangen, behauptete sie später, wobei selbst ihre engsten Vertrauten diese Darstellung mit einem gewissen Vorbehalt zur Kenntnis nahmen.',
    'Was der Übersetzer in jener Nacht aus dem Manuskript strich, sollte erst Jahrzehnte später, als der Nachlass geöffnet wurde, zum eigentlichen Skandal werden.',
  ],
};

export const storyOpener = (level: Level, rng: Rng): string => rng.pick(STORY_OPENERS[level]);

export interface StoryLine {
  id: string;
  /** 0 or 1 for the players; null for the opener. */
  player: 0 | 1 | null;
  text: string;
  /**
   * The tutor's verdict: `off` while the model is not loaded (checked later, once it is), then `checking`, then
   * `done` with the corrected line, the word diff and the rules behind the correction, or `error` with a note.
   */
  check?: { status: 'checking' | 'done' | 'error' | 'off'; corrected?: string | null; unchanged?: boolean; note?: string; diff?: DiffOp[] | null; rules?: RuleHit[] };
}

/** Whose sentence comes next: the players alternate after the opener. */
export const storyTurn = (lines: StoryLine[]): 0 | 1 => ((lines.filter((l) => l.player !== null).length % 2) as 0 | 1);

/** The whole story, with the tutor's corrected lines where they exist, to read aloud at the end. */
export const storyText = (lines: StoryLine[]) => lines.map((l) => (l.check?.status === 'done' && l.check.corrected ? l.check.corrected : l.text)).join(' ');

// ------------------------------------------------------------------------------------------------
// duel: two players alternate on the same kind of drill
// ------------------------------------------------------------------------------------------------

/** The drill kinds that make a fair two-player round (ordinals and sentence drills are too slow for a duel). */
export const DUEL_CATEGORIES: DrillCategory[] = ['article', 'meaning', 'plural', 'verbs', 'numbers', 'clock', 'prices'];

export interface DuelState {
  category: DrillCategory;
  level: Level;
  drills: Drill[];
  /** One entry per drill answered: whether it was right. */
  results: boolean[];
}

export function newDuel(category: DrillCategory, level: Level, lex: LexiconIndex, rng: Rng, rounds = 5): DuelState {
  return { category, level, drills: buildDrillSet(category, level, lex, rng, rounds * 2), results: [] };
}

/** Drill i goes to player 0 or 1 in turn. */
export const duelPlayer = (index: number): 0 | 1 => (index % 2 === 0 ? 0 : 1);

/** Records an answer; once every drill is answered further answers are ignored. */
export const duelAnswered = (state: DuelState, ok: boolean): DuelState =>
  duelDone(state) ? state : { ...state, results: [...state.results, ok] };

export const duelScores = (state: DuelState): [number, number] => {
  const s: [number, number] = [0, 0];
  state.results.forEach((ok, i) => {
    if (ok) s[duelPlayer(i)] += 1;
  });
  return s;
};

export const duelDone = (state: DuelState) => state.results.length >= state.drills.length;

/** The winner's index, or null for a draw. */
export function duelWinner(state: DuelState): 0 | 1 | null {
  const [a, b] = duelScores(state);
  return a === b ? null : a > b ? 0 : 1;
}
