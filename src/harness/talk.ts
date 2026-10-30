// Plaudern - a free conversation in German with a tandem partner, the thing learners say they miss most
// ("I can read but I can't speak"; "get a tandem partner" is the standard advice). The partner is one of three
// people with a life of their own (facts the model may use), the topic is the learner's choice, and the
// conversation rides on the role-play frame the model was trained on (src/harness/roleplay.ts): a card built
// here, the partner's line read and checked by readCounterpartLine, so it stays in German, in character, ends
// with a question and never repeats itself. What makes it a conversation with *this* learner is memory: the
// profile (src/state/profile.ts) and what they said last time (src/state/speaking.ts) go to the partner as
// facts, so she asks about the learner's city, job and last weekend, not a stranger's. Corrections come at the
// end, in a recap, never mid-flow.

import { LEVELS, levelIndex, type Level } from './levels';
import type { SceneCard, SceneFact } from './roleplay';

export interface TalkPartner {
  id: string;
  name: string;
  /** "deine Tandempartnerin" / "dein Tandempartner" */
  relation_de: string;
  relation_en: string;
  /** Facts about the partner, labelled as hers ("Dein Alter"), so the model does not hand them to the learner. */
  facts: [label_de: string, label_en: string, value: string][];
}

export const PARTNERS: TalkPartner[] = [
  {
    id: 'lena',
    name: 'Lena',
    relation_de: 'deine Tandempartnerin',
    relation_en: 'your tandem partner',
    facts: [
      ['Dein Alter', 'Your age', '29'],
      ['Dein Wohnort', 'You live in', 'Köln; du kommst aus Leipzig'],
      ['Dein Beruf', 'Your job', 'Physiotherapeutin in einer Praxis'],
      ['Deine Hobbys', 'Your hobbies', 'Bouldern, Kochen, Podcasts'],
      ['Dein Plan für Samstag', 'Your plan for Saturday', 'eine Wanderung in der Eifel'],
    ],
  },
  {
    id: 'jonas',
    name: 'Jonas',
    relation_de: 'dein Tandempartner',
    relation_en: 'your tandem partner',
    facts: [
      ['Dein Alter', 'Your age', '34'],
      ['Dein Wohnort', 'You live in', 'Hamburg; du kommst aus Rostock'],
      ['Dein Beruf', 'Your job', 'Grafikdesigner, selbstständig'],
      ['Deine Hobbys', 'Your hobbies', 'Fahrrad, Fotografie, Fußball (St. Pauli)'],
      ['Dein Plan für Sonntag', 'Your plan for Sunday', 'ein Stand auf dem Flohmarkt'],
    ],
  },
  {
    id: 'aylin',
    name: 'Aylin',
    relation_de: 'deine Tandempartnerin',
    relation_en: 'your tandem partner',
    facts: [
      ['Dein Alter', 'Your age', '26'],
      ['Dein Wohnort', 'You live in', 'München; aufgewachsen in Nürnberg, Familie aus der Türkei'],
      ['Dein Studium', 'Your studies', 'Informatik, letztes Semester'],
      ['Deine Hobbys', 'Your hobbies', 'Serien, Backen, Basketball'],
      ['Dein Plan für Freitag', 'Your plan for Friday', 'der Geburtstag deiner kleinen Schwester'],
    ],
  },
];

export interface TalkTopic {
  id: string;
  level: Level;
  title_de: string;
  /** The partner's opening line, German, after the greeting; the gloss is the UI catalog's `talk.topic.<id>`. */
  opener_de: string;
}

export const TALK_TOPICS: TalkTopic[] = [
  // A1
  { id: 'day', level: 'A1', title_de: 'Dein Tag', opener_de: 'Wie war dein Tag heute? Erzähl mal.' },
  { id: 'family', level: 'A1', title_de: 'Deine Familie', opener_de: 'Erzähl mir von deiner Familie. Wie viele seid ihr?' },
  { id: 'food', level: 'A1', title_de: 'Essen und Trinken', opener_de: 'Ich habe gerade richtig Hunger. Was isst du am liebsten?' },
  { id: 'home', level: 'A1', title_de: 'Deine Wohnung', opener_de: 'Wie wohnst du eigentlich, Wohnung oder Haus?' },
  { id: 'weekend', level: 'A1', title_de: 'Das Wochenende', opener_de: 'Na, was machst du am Wochenende?' },
  { id: 'hobbies', level: 'A1', title_de: 'Freizeit', opener_de: 'Was machst du gern, wenn du frei hast?' },
  // A2
  { id: 'lastweekend', level: 'A2', title_de: 'Dein letztes Wochenende', opener_de: 'Wie war dein Wochenende? Was hast du gemacht?' },
  { id: 'holiday', level: 'A2', title_de: 'Urlaub', opener_de: 'Ich brauche dringend Urlaub. Wo warst du zuletzt?' },
  { id: 'work', level: 'A2', title_de: 'Arbeit und Alltag', opener_de: 'Wie läuft es gerade bei dir mit der Arbeit?' },
  { id: 'city', level: 'A2', title_de: 'Deine Stadt', opener_de: 'Was gefällt dir an der Stadt, in der du wohnst?' },
  { id: 'shopping', level: 'A2', title_de: 'Einkaufen', opener_de: 'Ich muss nachher noch einkaufen. Wo kaufst du eigentlich ein?' },
  { id: 'sport', level: 'A2', title_de: 'Sport und Gesundheit', opener_de: 'Machst du eigentlich Sport? Ich war gestern wieder mal in der Halle.' },
  // B1
  { id: 'germany', level: 'B1', title_de: 'Leben in Deutschland', opener_de: 'Was war für dich am Anfang in Deutschland am schwierigsten?' },
  { id: 'plans', level: 'B1', title_de: 'Pläne für das Jahr', opener_de: 'Hast du Pläne für dieses Jahr, etwas, worauf du dich freust?' },
  { id: 'media', level: 'B1', title_de: 'Serien, Filme, Bücher', opener_de: 'Ich habe gerade eine Serie durchgeschaut. Was guckst oder liest du gerade?' },
  { id: 'learning', level: 'B1', title_de: 'Deutsch lernen', opener_de: 'Wie lernst du eigentlich Deutsch? Was klappt gut, und was nervt?' },
  { id: 'friends', level: 'B1', title_de: 'Leute kennenlernen', opener_de: 'Findest du es leicht, hier neue Leute kennenzulernen?' },
  { id: 'rent', level: 'B1', title_de: 'Wohnen und Mieten', opener_de: 'Die Mieten sind verrückt geworden. Wie ist das bei dir?' },
  // B2
  { id: 'news', level: 'B2', title_de: 'Was gerade los ist', opener_de: 'Hast du die Nachrichten verfolgt? Was beschäftigt dich gerade?' },
  { id: 'career', level: 'B2', title_de: 'Beruf und Zukunft', opener_de: 'Wo siehst du dich beruflich in fünf Jahren?' },
  { id: 'culture', level: 'B2', title_de: 'Kultur und Unterschiede', opener_de: 'Was hat dich an der Kultur hier am meisten überrascht?' },
  { id: 'environment', level: 'B2', title_de: 'Umwelt im Alltag', opener_de: 'Versuchst du, im Alltag nachhaltiger zu leben? Ich scheitere ständig daran.' },
  { id: 'digital', level: 'B2', title_de: 'Digitales Leben', opener_de: 'Wie viel Zeit verbringst du am Handy? Ich wahrscheinlich zu viel.' },
  { id: 'school', level: 'B2', title_de: 'Schule und Bildung', opener_de: 'Wie war die Schule bei dir? Hier wird ja ständig über das Schulsystem gestritten.' },
  // C1
  { id: 'society', level: 'C1', title_de: 'Gesellschaft', opener_de: 'Was müsste sich in diesem Land deiner Meinung nach dringend ändern?' },
  { id: 'worklife', level: 'C1', title_de: 'Arbeit und Leben', opener_de: 'Die Vier-Tage-Woche wird gerade viel diskutiert. Was hältst du davon?' },
  { id: 'identity', level: 'C1', title_de: 'Heimat und Identität', opener_de: 'Was bedeutet Heimat für dich, ein Ort oder eher ein Gefühl?' },
  { id: 'ai', level: 'C1', title_de: 'Technik und KI', opener_de: 'Nutzt du KI im Alltag? Ich bin da ehrlich gesagt hin- und hergerissen.' },
  // C2
  { id: 'language', level: 'C2', title_de: 'Sprache und Denken', opener_de: 'Verändert eine neue Sprache, wie man denkt? Die Frage lässt mich nicht los.' },
  { id: 'debate', level: 'C2', title_de: 'Eine Streitfrage', opener_de: 'Ich habe gestern über das Tempolimit gestritten. Welche Streitfrage reizt dich?' },
];

/** The topics at or below the level, the level's own first. */
export function talkTopicsFor(level: Level): TalkTopic[] {
  const own = TALK_TOPICS.filter((t) => t.level === level);
  const below = TALK_TOPICS.filter((t) => levelIndex(t.level) < levelIndex(level)).sort((a, b) => levelIndex(b.level) - levelIndex(a.level));
  return [...own, ...below];
}

export const talkTopicById = (id: string): TalkTopic | undefined => TALK_TOPICS.find((t) => t.id === id);

/** A partner for the day, so the same learner meets the same person for a while and a different one next week. */
export function partnerFor(day = Math.floor(Date.now() / 86_400_000)): TalkPartner {
  return PARTNERS[Math.floor(day / 7) % PARTNERS.length];
}

export interface TalkLearner {
  name: string;
  city: string;
  from: string;
  work: string;
  hobbies: string;
  why: string;
}

export interface TalkMemory {
  /** Titles of the last topics, newest first. */
  topics: string[];
  /** One thing the learner said last time, or null. */
  told: string | null;
}

const fact = (key: string, label_de: string, label_en: string, value: string): SceneFact => ({ key, label_de, label_en, value, alts: [] });

/** The learner's label in the dialogue: their first name, else "Tandempartner". */
export function learnerLabel(learner: TalkLearner): string {
  const first = learner.name.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}][\p{L}'-]{0,24}$/u.test(first) ? first : 'Tandempartner';
}

/**
 * The scene card the conversation runs on: the partner with her facts, the learner with theirs, the memory of
 * the last talks, and the topic's opener as the opening line. A custom topic is used as typed.
 */
export function talkCard(topic: TalkTopic | { id: 'own'; title_de: string }, partner: TalkPartner, learner: TalkLearner, memory: TalkMemory, level: Level): SceneCard {
  const me = learnerLabel(learner);
  const named = me !== 'Tandempartner';
  const title = topic.title_de.trim();
  // the partner's facts are "Dein …" (yours, the model's), the learner's "<Name>s …" or "Meine …": a 3B model
  // otherwise hands the partner's weekend to the learner
  const facts: SceneFact[] = partner.facts.map(([de, en, value], i) => fact(`p${i}`, de, en, value));
  const whose = named ? `${me}${/[sßxz]$/i.test(me) ? '’' : 's'}` : null;
  const about = (de: string, mine: string, en: string, value: string) => {
    const v = value.trim();
    if (v) facts.push(fact(`l${facts.length}`, whose ? `${whose} ${de}` : mine, whose ? `${whose} ${en}` : `my ${en}`, v));
  };
  about('Wohnort', 'Mein Wohnort', 'home town', learner.city);
  about('Herkunft', 'Meine Herkunft', 'origin', learner.from);
  about('Beruf', 'Mein Beruf', 'work or studies', learner.work);
  about('Hobbys', 'Meine Hobbys', 'hobbies', learner.hobbies);
  about('Grund, Deutsch zu lernen', 'Mein Grund, Deutsch zu lernen', 'reason to learn German', learner.why);
  if (memory.topics.length) facts.push(fact('m0', 'Eure letzten Gespräche', 'Your last conversations', memory.topics.join(', ')));
  if (memory.told) facts.push(fact('m1', `Was ${named ? me : 'dein Gegenüber'} dir letztes Mal erzählt hat`, `What ${named ? me : 'they'} told you last time`, `„${memory.told.trim()}“`));
  const opener = 'opener_de' in topic ? topic.opener_de : `Lass uns über „${title}“ reden. Was fällt dir dazu als Erstes ein?`;
  const greeting = named ? `Hey ${me}!` : 'Hey!';
  return {
    key: `talk:${topic.id}`,
    level,
    situation_de: `Ein lockeres Gespräch mit ${partner.relation_de} über: ${title}`,
    situation_en: `A relaxed chat with ${partner.relation_en} about: ${title}`,
    place: 'im Café',
    role_de: partner.name,
    role_en: `${partner.name}, ${partner.relation_en}`,
    learner_de: me,
    learner_en: named ? me : 'the learner, their tandem partner',
    register: 'du',
    facts,
    opening: `${greeting} ${opener}`,
    opening_gloss: '',
    beats: [],
  };
}

export const wordsOf = (text: string): number => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const FAREWELL = /^(?:tschüss|tschüs|ciao|bis (?:bald|dann|später|morgen|gleich)|mach'?s gut|gute nacht|schönen (?:tag|abend)(?: noch)?|auf wiedersehen|wiedersehen|bye|schlaf gut|man sieht sich|viel spaß(?: noch)?)\b/i;

/** Follow-up questions the partner falls back on when her line forgot to ask; picked by turn so they vary. */
export const FOLLOW_UPS: string[] = [
  'Und wie war das für dich?',
  'Erzähl mal, was hast du dann gemacht?',
  'Und bei dir, wie sieht das aus?',
  'Warum eigentlich?',
  'Was machst du da am liebsten?',
  'Und wie geht es jetzt weiter?',
  'Magst du mehr darüber erzählen?',
  'Was war das Beste daran?',
];

/**
 * A conversation partner does not say goodbye in the middle of a chat and always asks back: sentences that are
 * farewells are dropped, and a line left without a question gets a follow-up. Returns the line unchanged when
 * it already asks something.
 */
export function keepTalking(line: string, turn: number): string {
  const sentences = (line.match(/[^.!?…]+[.!?…]+["“”»]?|[^.!?…]+$/g) ?? [line]).map((s) => s.trim()).filter(Boolean);
  const kept = sentences.filter((s) => !FAREWELL.test(s.replace(/^[„"“]/, '')));
  const text = kept.join(' ').trim();
  if (/\?\s*["“”»]?$/.test(text) || text.includes('?')) return text;
  const q = FOLLOW_UPS[Math.abs(turn) % FOLLOW_UPS.length];
  return text ? `${text} ${q}` : q;
}

/** The learner's lines that are worth remembering: the longest one, trimmed to a sentence or two. */
export function thingTold(lines: string[]): string {
  const best = [...lines].sort((a, b) => wordsOf(b) - wordsOf(a))[0] ?? '';
  const sentences = best.match(/[^.!?]+[.!?]?/g) ?? [best];
  let out = '';
  for (const s of sentences) {
    if (out && wordsOf(out + s) > 28) break;
    out += s;
  }
  return out.trim().slice(0, 160);
}

/** Levels the talk is offered at: every one of them, as every level has topics. */
export const talkLevels = (): Level[] => LEVELS.filter((l) => TALK_TOPICS.some((t) => t.level === l));
