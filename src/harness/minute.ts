// Eine Minute - the top rung of the output ladder: talk for one minute, unscripted, on a prompt of the day.
// The learner reads the prompt (three cue points help with structure), speaks for sixty seconds while the
// phone's recognizer writes along (src/features/dictation.ts, continuous), and gets what the app can measure
// itself - words, words a minute, different words, fillers - and the tutor's rating on the exam grid
// (src/harness/exam.ts: Erfüllung, Kohärenz, Wortschatz, Strukturen, plus a comment, a tip and one improved
// sentence). The talks are kept in src/state/speaking.ts, so the learner sees their pace climb over weeks.

import { examPercent, fluencyScore, wordsOf, type ExamPart, type ExamPartResult, type ExamRating, type ExamSheet, type ExamTurn } from './exam';
import { type Level } from './levels';

export const MINUTE_SECONDS = 60;

export interface MinutePrompt {
  id: string;
  level: Level;
  /** The prompt, German; its gloss is the UI catalog's `minute.prompt.<id>`. */
  prompt_de: string;
  /** Three cue points, German, to give the talk a shape. */
  points_de: [string, string, string];
}

type Row = [level: Level, id: string, prompt: string, p1: string, p2: string, p3: string];

const ROWS: Row[] = [
  // A1: me and my day
  ['A1', 'a1-me', 'Stell dich vor.', 'Name und Alter', 'Woher du kommst, wo du wohnst', 'Was du gern machst'],
  ['A1', 'a1-day', 'Erzähl von deinem Tag.', 'Wann du aufstehst', 'Was du morgens und mittags machst', 'Was du am Abend machst'],
  ['A1', 'a1-family', 'Erzähl von deiner Familie.', 'Wer dazugehört', 'Wie alt sie sind, was sie machen', 'Was ihr zusammen macht'],
  ['A1', 'a1-food', 'Was isst und trinkst du gern?', 'Zum Frühstück', 'Dein Lieblingsessen', 'Was du nicht magst'],
  ['A1', 'a1-home', 'Beschreib deine Wohnung.', 'Wie viele Zimmer', 'Dein Lieblingsplatz', 'Was dir fehlt'],
  ['A1', 'a1-weekend', 'Was machst du am Wochenende?', 'Samstag', 'Sonntag', 'Mit wem'],
  ['A1', 'a1-city', 'Erzähl von deiner Stadt.', 'Wie groß sie ist', 'Was es dort gibt', 'Was du dort gern machst'],
  ['A1', 'a1-hobby', 'Was ist dein Hobby?', 'Was es ist', 'Wann und wo du es machst', 'Warum du es magst'],
  ['A1', 'a1-shopping', 'Du gehst einkaufen. Was kaufst du?', 'Wo du einkaufst', 'Was auf dem Zettel steht', 'Was es kostet'],
  ['A1', 'a1-weather', 'Wie ist das Wetter heute, und was machst du?', 'Das Wetter', 'Deine Kleidung', 'Dein Plan für heute'],
  // A2: past, plans, everyday life
  ['A2', 'a2-yesterday', 'Was hast du gestern gemacht?', 'Am Morgen', 'Am Nachmittag', 'Am Abend, und wie es war'],
  ['A2', 'a2-holiday', 'Erzähl von deinem letzten Urlaub.', 'Wohin, mit wem, wie lange', 'Was ihr gemacht habt', 'Was am schönsten war'],
  ['A2', 'a2-job', 'Erzähl von deiner Arbeit oder deinem Studium.', 'Was du machst', 'Ein normaler Tag', 'Was dir gefällt und was nicht'],
  ['A2', 'a2-plans', 'Was machst du nächstes Wochenende?', 'Dein Plan', 'Mit wem', 'Warum du dich freust'],
  ['A2', 'a2-doctor', 'Du bist krank. Erzähl, was passiert ist.', 'Seit wann, was wehtut', 'Was du gemacht hast', 'Was der Arzt sagt'],
  ['A2', 'a2-birthday', 'Erzähl von einer Feier, die dir gefallen hat.', 'Was gefeiert wurde', 'Wer da war, was es gab', 'Warum sie schön war'],
  ['A2', 'a2-transport', 'Wie kommst du zur Arbeit oder zur Schule?', 'Womit, wie lange', 'Was unterwegs passiert', 'Was besser sein könnte'],
  ['A2', 'a2-friend', 'Beschreib einen guten Freund oder eine gute Freundin.', 'Wie ihr euch kennt', 'Wie er oder sie ist', 'Was ihr zusammen macht'],
  ['A2', 'a2-german', 'Warum lernst du Deutsch?', 'Seit wann', 'Wie du lernst', 'Was noch schwer ist'],
  ['A2', 'a2-season', 'Welche Jahreszeit magst du am liebsten?', 'Welche, und warum', 'Was du dann machst', 'Was du dann isst oder trägst'],
  // B1: experiences, opinions, comparisons
  ['B1', 'b1-move', 'Erzähl von einem Umzug oder einem Neuanfang.', 'Was sich geändert hat', 'Was schwierig war', 'Was du heute darüber denkst'],
  ['B1', 'b1-germany', 'Was hat dich in Deutschland überrascht?', 'Ein Beispiel aus dem Alltag', 'Wie es bei dir zu Hause ist', 'Woran du dich gewöhnt hast'],
  ['B1', 'b1-media', 'Empfiehl eine Serie, einen Film oder ein Buch.', 'Worum es geht', 'Warum es dir gefällt', 'Für wen es etwas ist'],
  ['B1', 'b1-habit', 'Welche Gewohnheit möchtest du ändern?', 'Welche, und seit wann', 'Warum es schwer ist', 'Was du schon versucht hast'],
  ['B1', 'b1-online', 'Einkaufen online oder im Geschäft - was ist besser?', 'Vorteile', 'Nachteile', 'Deine Meinung mit Beispiel'],
  ['B1', 'b1-help', 'Erzähl von einer Situation, in der dir jemand geholfen hat.', 'Was passiert ist', 'Wer geholfen hat und wie', 'Was du daraus gelernt hast'],
  ['B1', 'b1-city-country', 'Stadt oder Land - wo lebt man besser?', 'Was für die Stadt spricht', 'Was für das Land spricht', 'Wo du leben möchtest'],
  ['B1', 'b1-work-day', 'Beschreib einen stressigen Tag und wie du ihn geschafft hast.', 'Was alles anstand', 'Was schiefging', 'Was du beim nächsten Mal anders machst'],
  ['B1', 'b1-tradition', 'Erzähl von einem Fest oder einer Tradition aus deiner Heimat.', 'Wann und warum man feiert', 'Was man macht und isst', 'Was dir daran wichtig ist'],
  ['B1', 'b1-sport', 'Sollte Sport in der Schule Pflicht sein?', 'Argumente dafür', 'Argumente dagegen', 'Deine eigene Erfahrung'],
  // B2: arguments, society, work
  ['B2', 'b2-homeoffice', 'Homeoffice oder Büro - was ist besser für die Arbeit?', 'Vorteile für Beschäftigte', 'Nachteile für Teams', 'Deine Position und ein Beispiel'],
  ['B2', 'b2-social', 'Machen soziale Medien uns einsamer?', 'Was dafür spricht', 'Was dagegen spricht', 'Wie du selbst damit umgehst'],
  ['B2', 'b2-climate', 'Was kann der Einzelne wirklich für das Klima tun?', 'Was im Alltag zählt', 'Wo Politik gefragt ist', 'Was du selbst geändert hast'],
  ['B2', 'b2-language', 'Sollte man im Ausland die Landessprache perfekt lernen?', 'Was dafür spricht', 'Wo die Grenzen liegen', 'Deine Erfahrung'],
  ['B2', 'b2-cash', 'Bargeld oder Karte - braucht Deutschland noch Bargeld?', 'Argumente für Bargeld', 'Argumente für digitales Bezahlen', 'Deine Prognose'],
  ['B2', 'b2-failure', 'Erzähl von einem Misserfolg, der dich weitergebracht hat.', 'Was passiert ist', 'Wie du reagiert hast', 'Was sich dadurch geändert hat'],
  ['B2', 'b2-news', 'Wie informierst du dich über Nachrichten, und wem vertraust du?', 'Deine Quellen', 'Das Problem mit Falschmeldungen', 'Was Medien besser machen könnten'],
  ['B2', 'b2-generations', 'Was können Jüngere von Älteren lernen, und umgekehrt?', 'Ein Beispiel aus deiner Familie', 'Was oft zu Konflikten führt', 'Dein Fazit'],
  ['B2', 'b2-tourism', 'Tut Tourismus einer Stadt gut?', 'Wirtschaftliche Vorteile', 'Folgen für die Bewohner', 'Ein Beispiel, das du kennst'],
  ['B2', 'b2-health', 'Sollte ungesundes Essen höher besteuert werden?', 'Argumente dafür', 'Argumente dagegen', 'Deine Meinung mit Begründung'],
  // C1: analysis, nuance, abstract topics
  ['C1', 'c1-fourday', 'Die Vier-Tage-Woche: Fortschritt oder Risiko für die Wirtschaft?', 'Was Studien und Betriebe berichten', 'Wer davon profitiert, wer nicht', 'Deine Einschätzung'],
  ['C1', 'c1-ai', 'Wie verändert künstliche Intelligenz die Arbeitswelt?', 'Welche Berufe betroffen sind', 'Chancen und Gefahren', 'Was Politik und Bildung tun sollten'],
  ['C1', 'c1-heimat', 'Was bedeutet Heimat in einer mobilen Gesellschaft?', 'Ort, Menschen oder Sprache', 'Deine eigene Erfahrung', 'Ob man mehrere Heimaten haben kann'],
  ['C1', 'c1-integration', 'Was macht Integration gelingen?', 'Die Rolle von Sprache und Arbeit', 'Was die Aufnahmegesellschaft beitragen muss', 'Ein Beispiel aus deinem Umfeld'],
  ['C1', 'c1-wealth', 'Ist Ungleichheit der Preis für Wohlstand?', 'Was Ungleichheit antreibt', 'Was sie für den Zusammenhalt bedeutet', 'Welche Maßnahmen du für sinnvoll hältst'],
  ['C1', 'c1-democracy', 'Warum verlieren viele Menschen das Vertrauen in die Politik?', 'Mögliche Ursachen', 'Die Rolle der Medien', 'Was Vertrauen zurückbringen könnte'],
  ['C1', 'c1-education', 'Bereitet die Schule auf das Leben vor?', 'Was gelehrt wird und was fehlt', 'Wie es in deinem Herkunftsland ist', 'Was du ändern würdest'],
  ['C1', 'c1-privacy', 'Wie viel Privatsphäre sind wir bereit aufzugeben?', 'Bequemlichkeit gegen Daten', 'Wo für dich die Grenze liegt', 'Was der Staat regeln sollte'],
  ['C1', 'c1-culture', 'Braucht Kultur staatliche Förderung?', 'Theater, Museen, Musik', 'Argumente für den Markt', 'Deine Position'],
  ['C1', 'c1-luck', 'Ist Erfolg eher Leistung oder Glück?', 'Was Herkunft bewirkt', 'Was man selbst in der Hand hat', 'Ein Beispiel, das dich überzeugt'],
  // C2: essayistic, precise, with register
  ['C2', 'c2-gendern', 'Geschlechtergerechte Sprache: notwendiger Wandel oder Eingriff in die Sprache?', 'Die sprachwissenschaftliche Seite', 'Die gesellschaftliche Debatte', 'Dein differenziertes Urteil'],
  ['C2', 'c2-tempolimit', 'Warum ist das Tempolimit in Deutschland so umstritten?', 'Fakten und Zahlen, die du kennst', 'Was Freiheit hier bedeutet', 'Was du einem Ausländer erklären würdest'],
  ['C2', 'c2-memory', 'Wie soll eine Gesellschaft mit ihrer Vergangenheit umgehen?', 'Erinnern und Verantwortung', 'Die Gefahr der Ritualisierung', 'Was die deutsche Erinnerungskultur lehrt'],
  ['C2', 'c2-truth', 'Gibt es in der Politik noch eine gemeinsame Wirklichkeit?', 'Filterblasen und Algorithmen', 'Die Rolle öffentlich-rechtlicher Medien', 'Was Streitkultur ausmacht'],
  ['C2', 'c2-growth', 'Ist Wirtschaftswachstum ohne Ende möglich oder wünschenswert?', 'Was für Wachstum spricht', 'Die Grenzen des Planeten', 'Welche Alternative du überzeugend findest'],
  ['C2', 'c2-translation', 'Kann man Literatur wirklich übersetzen?', 'Was verloren geht', 'Was gewonnen wird', 'Ein Beispiel aus deiner Sprache'],
  ['C2', 'c2-bureaucracy', 'Ist Bürokratie der Preis des Rechtsstaats oder sein Feind?', 'Was Regeln leisten', 'Wo sie lähmen', 'Was du reformieren würdest'],
  ['C2', 'c2-work-meaning', 'Muss Arbeit Sinn stiften?', 'Arbeit als Broterwerb', 'Arbeit als Identität', 'Deine eigene Haltung'],
  ['C2', 'c2-city-future', 'Wie sieht die Stadt der Zukunft aus?', 'Verkehr und Wohnen', 'Wer darin Platz hat', 'Was heute schon entschieden wird'],
  ['C2', 'c2-humor', 'Was sagt der Humor eines Landes über seine Kultur?', 'Was man worüber lacht', 'Was nicht geht', 'Ein Vergleich mit deiner Kultur'],
];

export const MINUTE_PROMPTS: MinutePrompt[] = ROWS.map(([level, id, prompt, p1, p2, p3]) => ({ id, level, prompt_de: prompt, points_de: [p1, p2, p3] }));

export const minutePromptsFor = (level: Level): MinutePrompt[] => MINUTE_PROMPTS.filter((p) => p.level === level);
export const minutePromptById = (id: string): MinutePrompt | undefined => MINUTE_PROMPTS.find((p) => p.id === id);

/**
 * Today's prompt: the level's prompts in a fixed rotation by day, skipping the ones already done (so a learner
 * who talks twice a day gets a new one), back to the start when all were done.
 */
export function promptOfDay(level: Level, done: string[], day = Math.floor(Date.now() / 86_400_000)): MinutePrompt {
  const pool = minutePromptsFor(level);
  const start = day % pool.length;
  for (let i = 0; i < pool.length; i += 1) {
    const p = pool[(start + i) % pool.length];
    if (!done.includes(p.id)) return p;
  }
  return pool[start];
}

/** The words the learner should reach in a minute at the level; the rating counts fewer as too short. */
export const MIN_WORDS: Record<Level, number> = { A1: 35, A2: 45, B1: 60, B2: 70, C1: 80, C2: 85 };

/** The talk as an exam part, so the tutor's rating and the fluency bands of src/harness/exam.ts apply. */
export function minutePart(level: Level): ExamPart {
  return {
    id: `minute-${level}`,
    kind: 'monologue',
    title_de: 'Eine Minute frei sprechen',
    about_en: 'One minute of free speech on a prompt',
    prepSeconds: 0,
    speakSeconds: MINUTE_SECONDS,
    minWords: MIN_WORDS[level],
    examiner_de: '',
    sheet_en: null,
    followup: false,
  };
}

/** The prompt as the tutor's task sheet: the question and its cue points. */
export const minuteSheet = (prompt: MinutePrompt | { prompt_de: string; points_de: string[] }): ExamSheet => ({ heading: prompt.prompt_de, points: prompt.points_de });

const FILLERS = /^(?:ähm?|äh|hm+|ehm?|eh|mhm|ähem|öhm?|em)$/i;

export interface MinuteStats {
  words: number;
  distinct: number;
  fillers: number;
  seconds: number;
  wpm: number;
  /** Sentences the recognizer heard as separate utterances, roughly. */
  longestRun: number;
}

/** What the app measures itself from the transcript. */
export function minuteStats(said: string, seconds: number): MinuteStats {
  const tokens = said
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
  const fillers = tokens.filter((w) => FILLERS.test(w)).length;
  const real = tokens.filter((w) => !FILLERS.test(w));
  const secs = Math.max(1, seconds);
  const runs = said.split(/[.!?]+/).map((s) => wordsOf(s));
  return {
    words: real.length,
    distinct: new Set(real).size,
    fillers,
    seconds: secs,
    wpm: Math.round((real.length / secs) * 60),
    longestRun: Math.max(0, ...runs),
  };
}

/** The talk as a rated exam part: fluency by code, the rest the tutor's. */
export function minuteResult(level: Level, said: string, seconds: number, rating: ExamRating | null): ExamPartResult & { percent: number | null } {
  const part = minutePart(level);
  const turns: ExamTurn[] = [{ prompt: '', said, seconds }];
  const result: ExamPartResult = { partId: part.id, turns, rating, fluency: fluencyScore(level, part, turns), words: wordsOf(said) };
  return { ...result, percent: examPercent([result]) };
}

/** Variety: different words over words, 0-1; the dashboard shows it as "{n} different words". */
export const variety = (s: MinuteStats): number => (s.words ? s.distinct / s.words : 0);
