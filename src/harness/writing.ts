// Writing tasks in the shape of the Goethe and telc writing parts. The app checks what code can check
// (length, the content points, the register of opening and closing, du/Sie in a formal letter) before the
// model corrects the language, the same split as the exam rubric's task-fulfilment and language columns.

import { normalise } from './engines';
import type { Level } from './levels';
import { wordCount } from './route';

export interface ContentPoint {
  /** The point as the learner reads it (English for bundled tasks; localizeWriting swaps in the app language). */
  en: string;
  /** The same point in German, for the German app language; tasks the tutor wrote have none. */
  de?: string;
  any: string[];
}

export interface WriteTask {
  id: string;
  level: Level;
  register: 'formal' | 'informal';
  words: [number, number];
  title: string;
  /** The title in German; tasks the tutor wrote have none. */
  titleDe?: string;
  prompt: string;
  promptDe: string;
  points: ContentPoint[];
}

export const WRITE_TASKS: WriteTask[] = [
  {
    id: 'a1-cafe-invite',
    level: 'A1',
    register: 'informal',
    words: [20, 30],
    title: 'A message to a friend',
    titleDe: 'Eine Nachricht an eine Freundin',
    prompt: 'Write a short message to your friend Lena: you are at the café "Lindenblatt". Ask if she wants to come, say until when you are there, and what you are drinking.',
    promptDe: 'Schreib eine kurze Nachricht an deine Freundin Lena: Du bist im Café „Lindenblatt“. Frag, ob sie kommt, sag, bis wann du da bist und was du trinkst.',
    points: [
      { en: 'ask if she comes', de: 'fragen, ob sie kommt', any: ['kommst du', 'hast du zeit', 'lust', 'willst du', 'komm doch', 'kommen'] },
      { en: 'until when', de: 'bis wann', any: ['bis ', 'uhr', 'halb', 'noch eine stunde'] },
      { en: 'what you drink', de: 'was du trinkst', any: ['kaffee', 'tee', 'cappuccino', 'saft', 'wasser', 'trinke', 'kakao', 'latte'] },
    ],
  },
  {
    id: 'a1-hotel-form',
    level: 'A1',
    register: 'formal',
    words: [20, 35],
    title: 'An email to a hotel',
    titleDe: 'Eine E-Mail an ein Hotel',
    prompt: 'Write a short email to the Hotel Seeblick: you want a single room for two nights from Friday. Ask for the price and if breakfast is included.',
    promptDe: 'Schreib eine kurze E-Mail an das Hotel Seeblick: Du möchtest ein Einzelzimmer für zwei Nächte ab Freitag. Frag nach dem Preis und ob das Frühstück inklusive ist.',
    points: [
      { en: 'the room and the dates', de: 'das Zimmer und die Daten', any: ['einzelzimmer', 'zimmer', 'zwei nachte', 'zwei naechte', 'freitag'] },
      { en: 'ask for the price', de: 'nach dem Preis fragen', any: ['preis', 'kostet', 'kosten'] },
      { en: 'ask about breakfast', de: 'nach dem Frühstück fragen', any: ['fruhstuck', 'fruehstueck'] },
    ],
  },
  {
    id: 'a2-birthday',
    level: 'A2',
    register: 'informal',
    words: [30, 40],
    title: 'A birthday invitation',
    titleDe: 'Eine Geburtstagseinladung',
    prompt: 'Write a short email to a friend: invite them to your birthday party on Saturday. Say when it starts, where it is, and what they should bring. 30-40 words.',
    promptDe: 'Schreib eine kurze E-Mail an einen Freund oder eine Freundin: Lade zu deiner Geburtstagsparty am Samstag ein. Sag, wann sie beginnt, wo sie ist und was er oder sie mitbringen soll. 30-40 Wörter.',
    points: [
      { en: 'when it starts', de: 'wann es anfängt', any: ['uhr', 'halb', 'viertel', 'abend', 'nachmittag', 'beginnt', 'um '] },
      { en: 'where it is', de: 'wo es ist', any: ['bei mir', 'zu hause', 'zuhause', 'in der', 'im ', 'park', 'restaurant', 'cafe', 'strasse', 'adresse', 'garten', 'wohnung'] },
      { en: 'what to bring', de: 'was man mitbringen soll', any: ['mitbring', 'bring', 'kuchen', 'getrank', 'getraenk', 'salat', 'musik', 'spiel'] },
    ],
  },
  {
    id: 'a2-sick-course',
    level: 'A2',
    register: 'formal',
    words: [30, 40],
    title: 'Missing a course',
    titleDe: 'Im Kurs fehlen',
    prompt: 'Write to your teacher, Herr Klein: you are ill and cannot come to the German course tomorrow. Say what you have, and ask what the homework is. 30-40 words.',
    promptDe: 'Schreib an deinen Lehrer, Herrn Klein: Du bist krank und kannst morgen nicht zum Deutschkurs kommen. Sag, was du hast, und frag nach den Hausaufgaben. 30-40 Wörter.',
    points: [
      { en: 'you cannot come', de: 'du kannst nicht kommen', any: ['nicht kommen', 'kann nicht', 'nicht teilnehmen', 'fehlen'] },
      { en: 'what you have', de: 'was du hast', any: ['krank', 'fieber', 'erkaltet', 'erkaeltet', 'kopfschmerzen', 'grippe', 'husten', 'halsschmerzen', 'schnupfen'] },
      { en: 'ask for the homework', de: 'nach den Hausaufgaben fragen', any: ['hausaufgab', 'aufgab'] },
    ],
  },
  {
    id: 'a2-new-flat',
    level: 'A2',
    register: 'informal',
    words: [30, 40],
    title: 'Your new flat',
    titleDe: 'Deine neue Wohnung',
    prompt: 'Write to your friend Jonas: you have a new flat. Describe it, say what you like about it, and invite him to visit.',
    promptDe: 'Schreib an deinen Freund Jonas: Du hast eine neue Wohnung. Beschreib sie, sag, was dir gefällt, und lade ihn ein.',
    points: [
      { en: 'describe the flat', de: 'die Wohnung beschreiben', any: ['zimmer', 'balkon', 'kuche', 'kueche', 'gross', 'klein', 'hell', 'quadratmeter', 'bad'] },
      { en: 'what you like', de: 'was dir gefällt', any: ['gefallt', 'gefaellt', 'mag', 'finde', 'schon', 'toll', 'super', 'gut'] },
      { en: 'invite him', de: 'ihn einladen', any: ['besuch', 'komm', 'lust', 'zeit', 'einladen', 'wochenende'] },
    ],
  },
  {
    id: 'b1-missed-party',
    level: 'B1',
    register: 'informal',
    words: [70, 100],
    title: 'Sorry I missed your party',
    titleDe: 'Entschuldigung für die verpasste Party',
    prompt: 'Write an email (about 80 words) to a friend: you missed their party last weekend. Apologise, explain why you could not come, and suggest a new meeting.',
    promptDe: 'Schreib eine E-Mail (ca. 80 Wörter) an einen Freund oder eine Freundin: Du hast die Party am Wochenende verpasst. Entschuldige dich, erkläre, warum du nicht kommen konntest, und schlag ein neues Treffen vor.',
    points: [
      { en: 'apologise', de: 'sich entschuldigen', any: ['entschuldig', 'tut mir leid', 'leid', 'verzeih', 'sorry'] },
      { en: 'explain why', de: 'den Grund erklären', any: ['weil', 'denn', 'musste', 'krank', 'arbeit', 'da ich', 'deshalb', 'leider'] },
      { en: 'suggest a new meeting', de: 'ein neues Treffen vorschlagen', any: ['treffen', 'lust', 'zeit', 'wollen wir', 'konnten wir', 'koennten wir', 'wie ware', 'wie waere', 'vorschlag', 'nachsten', 'naechsten', 'nachste woche', 'naechste woche', 'wochenende', 'kino', 'cafe'] },
    ],
  },
  {
    id: 'b1-teacher-absent',
    level: 'B1',
    register: 'formal',
    words: [35, 60],
    title: 'An email to your teacher',
    titleDe: 'Eine E-Mail an deine Lehrerin',
    prompt: 'Write a formal email (about 40 words) to your German teacher, Frau Weber: you cannot attend the next lesson. Give the reason and ask for the homework.',
    promptDe: 'Schreib eine formelle E-Mail (ca. 40 Wörter) an deine Deutschlehrerin, Frau Weber: Du kannst am nächsten Unterricht nicht teilnehmen. Nenne den Grund und frag nach den Hausaufgaben.',
    points: [
      { en: 'the reason', de: 'der Grund', any: ['weil', 'da ', 'termin', 'arzt', 'krank', 'arbeit', 'leider', 'deshalb', 'aus diesem grund'] },
      { en: 'ask for the homework', de: 'nach den Hausaufgaben fragen', any: ['hausaufgab', 'aufgab', 'material', 'unterlagen', 'schicken', 'zusenden'] },
    ],
  },
  {
    id: 'b1-forum-homeoffice',
    level: 'B1',
    register: 'informal',
    words: [70, 90],
    title: 'A forum post: working from home',
    titleDe: 'Ein Forumsbeitrag: Arbeiten von zu Hause',
    prompt: 'Write a forum post (about 80 words): is working from home a good idea? Give your opinion, one advantage, one disadvantage, and an example from your life.',
    promptDe: 'Schreib einen Forumsbeitrag (ca. 80 Wörter): Ist Homeoffice eine gute Idee? Sag deine Meinung, einen Vorteil, einen Nachteil und ein Beispiel aus deinem Leben.',
    points: [
      { en: 'your opinion', de: 'deine Meinung', any: ['meiner meinung', 'ich finde', 'ich glaube', 'ich denke', 'meines erachtens'] },
      { en: 'an advantage', de: 'ein Vorteil', any: ['vorteil', 'positiv', 'gut ist', 'man spart', 'flexibel'] },
      { en: 'a disadvantage', de: 'ein Nachteil', any: ['nachteil', 'negativ', 'problem', 'allerdings', 'aber', 'einsam'] },
      { en: 'an example', de: 'ein Beispiel', any: ['zum beispiel', 'z. b', 'z.b', 'bei mir', 'ich arbeite', 'letzte woche'] },
    ],
  },
  {
    id: 'b2-course-complaint',
    level: 'B2',
    register: 'formal',
    words: [110, 200],
    title: 'A complaint to a language school',
    titleDe: 'Eine Beschwerde an eine Sprachschule',
    prompt: 'Write a formal complaint (about 150 words) to a language school: your course had no teacher for three sessions. Describe what happened, say what you expect the school to do, and set a deadline for their answer.',
    promptDe: 'Schreib eine formelle Beschwerde (ca. 150 Wörter) an eine Sprachschule: In deinem Kurs ist dreimal der Unterricht ohne Lehrkraft ausgefallen. Beschreibe, was passiert ist, sag, was du von der Schule erwartest, und setze eine Frist für die Antwort.',
    points: [
      { en: 'describe what happened', de: 'beschreiben, was passiert ist', any: ['dreimal', 'drei ', 'ausgefallen', 'ohne lehr', 'kein unterricht', 'keine lehr', 'nicht stattgefunden', 'stunden'] },
      { en: 'say what you expect', de: 'sagen, was du erwartest', any: ['erstatt', 'ruckzahl', 'rueckzahl', 'ersatz', 'nachhol', 'losung', 'loesung', 'erwarte', 'fordere', 'bitte ich', 'verlange'] },
      { en: 'set a deadline', de: 'eine Frist setzen', any: ['bis zum', 'bis ', 'frist', 'innerhalb', 'spatestens', 'spaetestens', 'zwei wochen', '14 tage'] },
    ],
  },
  {
    id: 'b2-application',
    level: 'B2',
    register: 'formal',
    words: [120, 180],
    title: 'An application for an internship',
    titleDe: 'Eine Bewerbung um ein Praktikum',
    prompt: 'Write a formal application (about 150 words) for an internship at a museum in Hamburg: say why you are interested, what experience you have, and when you are available.',
    promptDe: 'Schreib eine formelle Bewerbung (ca. 150 Wörter) für ein Praktikum in einem Museum in Hamburg: Sag, warum du dich interessierst, welche Erfahrung du hast und wann du verfügbar bist.',
    points: [
      { en: 'why you are interested', de: 'warum du dich interessierst', any: ['interess', 'begeister', 'motivier', 'reizt mich', 'mochte gern', 'moechte gern'] },
      { en: 'your experience', de: 'deine Erfahrung', any: ['erfahrung', 'gearbeitet', 'studium', 'studiere', 'kenntnisse', 'praktikum'] },
      { en: 'when you are available', de: 'wann du verfügbar bist', any: ['ab dem', 'ab ', 'verfugbar', 'verfuegbar', 'zeit', 'monat', 'zur verfugung', 'zur verfuegung'] },
    ],
  },
  {
    id: 'c1-letter-to-editor',
    level: 'C1',
    register: 'formal',
    words: [180, 250],
    title: 'A letter to the editor on the four-day week',
    titleDe: 'Ein Leserbrief zur Vier-Tage-Woche',
    prompt: 'A newspaper has published an article claiming that a four-day week would harm the economy. Write a letter to the editor (about 200 words): refer to the article, take a clear position with two arguments, address one counter-argument, and end with a recommendation or an appeal.',
    promptDe: 'Eine Zeitung hat einen Artikel veröffentlicht, in dem behauptet wird, die Vier-Tage-Woche schade der Wirtschaft. Schreib einen Leserbrief (ca. 200 Wörter): Nimm Bezug auf den Artikel, bezieh mit zwei Argumenten klar Stellung, geh auf ein Gegenargument ein und schließ mit einer Empfehlung oder einem Appell.',
    points: [
      { en: 'a reference to the article', de: 'der Bezug auf den Artikel', any: ['artikel', 'beitrag', 'ausgabe', 'ihrer zeitung', 'ihre zeitung', 'bericht', 'gelesen', 'kommentar'] },
      { en: 'your position with two arguments', de: 'deine Position mit zwei Argumenten', any: ['meiner meinung', 'meiner ansicht', 'meines erachtens', 'ich bin der ansicht', 'ich bin der auffassung', 'ich bin uberzeugt', 'ich bin ueberzeugt', 'ich halte', 'zum einen', 'erstens', 'einerseits', 'ich widerspreche', 'ich teile'] },
      { en: 'a counter-argument you address', de: 'ein Gegenargument, auf das du eingehst', any: ['zwar', 'einwand', 'gegenargument', 'zugegeben', 'naturlich', 'natuerlich', 'allerdings', 'dennoch', 'jedoch', 'kritiker', 'einwenden', 'sicherlich', 'gewiss'] },
      { en: 'a recommendation or an appeal at the end', de: 'eine Empfehlung oder ein Appell am Schluss', any: ['sollte', 'sollten', 'empfehle', 'fordere', 'appell', 'pladiere', 'plaediere', 'es ware', 'es waere', 'mussen wir', 'muessen wir', 'an der zeit', 'hochste zeit', 'hoechste zeit', 'rate ich'] },
    ],
  },
  {
    id: 'c1-statement-management',
    level: 'C1',
    register: 'formal',
    words: [200, 280],
    title: 'A statement to management on working from home',
    titleDe: 'Eine Stellungnahme an die Geschäftsführung zum Homeoffice',
    prompt: 'Your company wants to end working from home completely. As the spokesperson of your team, write a formal statement to the management (about 220 words): describe the current arrangement, explain the consequences of the plan for the team, propose a compromise, and ask for a meeting.',
    promptDe: 'Deine Firma will das Homeoffice komplett abschaffen. Schreib als Sprecher deines Teams eine formelle Stellungnahme an die Geschäftsführung (ca. 220 Wörter): Beschreib die aktuelle Regelung, erläutere die Folgen des Plans für das Team, schlag einen Kompromiss vor und bitte um ein Gespräch.',
    points: [
      { en: 'the current arrangement', de: 'die aktuelle Regelung', any: ['derzeit', 'zurzeit', 'aktuell', 'bisher', 'momentan', 'gegenwartig', 'gegenwaertig', 'im moment', 'seit', 'bislang', 'regelung'] },
      { en: 'the consequences for the team', de: 'die Folgen für das Team', any: ['folge', 'auswirkung', 'konsequenz', 'fuhrt', 'fuehrt', 'fuhren', 'fuehren', 'bedeutet', 'motivation', 'produktiv', 'kundigung', 'kuendigung', 'belast', 'verlust', 'gefahr'] },
      { en: 'a compromise proposal', de: 'ein Kompromissvorschlag', any: ['kompromiss', 'vorschlag', 'schlage', 'schlagen wir', 'alternativ', 'stattdessen', 'denkbar', 'hybrid', 'zwei tage', 'drei tage', 'prasenztag', 'praesenztag', 'anwesenheit'] },
      { en: 'a request for a meeting', de: 'die Bitte um ein Gespräch', any: ['gesprach', 'gespraech', 'termin', 'austausch', 'treffen', 'besprechung', 'zur verfugung', 'zur verfuegung', 'sitzung', 'dialog'] },
    ],
  },
  {
    id: 'c2-objection-bank-fees',
    level: 'C2',
    register: 'formal',
    words: [220, 300],
    title: 'An objection to a bank about unlawful account fees',
    titleDe: 'Ein Einspruch bei der Bank wegen unzulässiger Kontogebühren',
    prompt: 'Your bank raised its account fees two years ago without your explicit consent and now refuses to refund them, citing your "tacit acceptance". Write a formal objection to the bank (about 260 words): set out the facts with dates and amounts, state the legal basis and the ruling you rely on, demand the refund with a deadline, and announce the steps you will take if the bank does not comply.',
    promptDe: 'Deine Bank hat vor zwei Jahren die Kontogebühren ohne deine ausdrückliche Zustimmung erhöht und verweigert nun die Erstattung unter Verweis auf deine „stillschweigende Zustimmung“. Schreib einen formellen Einspruch an die Bank (ca. 260 Wörter): Stell den Sachverhalt mit Daten und Beträgen dar, nenn die Rechtsgrundlage und das Urteil, auf das du dich berufst, fordere die Erstattung mit einer Frist und kündige an, welche Schritte du einleiten wirst, falls die Bank nicht reagiert.',
    points: [
      { en: 'the facts with dates and amounts', de: 'der Sachverhalt mit Daten und Beträgen', any: ['sachverhalt', 'euro', ' eur ', 'seit dem', 'seit januar', 'seit februar', 'seit marz', 'seit maerz', 'seit april', 'seit mai', 'seit juni', 'seit juli', 'seit august', 'seit september', 'seit oktober', 'seit november', 'seit dezember', 'zum 1.', 'monatlich', 'pro monat', 'je monat', 'gebuhr', 'gebuehr', 'erhoht', 'erhoeht', 'kontofuhrung', 'kontofuehrung', 'entgelt'] },
      { en: 'the legal basis and the ruling you rely on', de: 'die Rechtsgrundlage und das Urteil, auf das du dich berufst', any: ['urteil', 'bundesgerichtshof', 'bgh', 'rechtsprechung', 'gemass', 'gemaess', 'paragraf', 'unwirksam', 'rechtswidrig', 'rechtsgrundlage', 'bgb', 'agb', 'gesetz', 'zustimmung', 'berufe ich mich', 'entschieden'] },
      { en: 'the demand for a refund with a deadline', de: 'die Forderung nach Erstattung mit Frist', any: ['erstatt', 'ruckzahlung', 'rueckzahlung', 'zuruckzuzahlen', 'zurueckzuzahlen', 'frist', 'bis zum', 'bis spatestens', 'bis spaetestens', 'innerhalb von', 'fordere', 'auffordern', 'fordere ich sie'] },
      { en: 'the steps you will take if the bank does not comply', de: 'die Schritte, die du bei Nichterfüllung einleitest', any: ['andernfalls', 'anderenfalls', 'ansonsten', 'ombudsmann', 'ombudsstelle', 'schlichtung', 'verbraucherzentrale', 'bafin', 'rechtsanwalt', 'rechtliche schritte', 'gerichtlich', 'klage', 'mahnverfahren', 'vorbehalte ich mir', 'behalte ich mir vor', 'einschalten'] },
    ],
  },
  {
    id: 'c2-expert-statement-council',
    level: 'C2',
    register: 'formal',
    words: [240, 320],
    title: 'An expert statement to the city council on a car-free centre',
    titleDe: 'Eine Stellungnahme an den Stadtrat zur autofreien Innenstadt',
    prompt: 'The city council has asked you, as an invited expert, for a written statement on a plan to make the historic centre car-free. Write a formal statement to the council (about 280 words): weigh up the plan\'s expected effects against each other, cite the evidence or experience you draw on, address the strongest objection, and close with a recommendation tied to conditions.',
    promptDe: 'Der Stadtrat hat dich als geladenen Experten um eine schriftliche Stellungnahme zu dem Plan gebeten, die historische Innenstadt autofrei zu machen. Schreib eine formelle Stellungnahme an den Rat (ca. 280 Wörter): Wäge die erwarteten Wirkungen des Plans gegeneinander ab, nenn die Belege oder Erfahrungen, auf die du dich stützt, geh auf den gewichtigsten Einwand ein und schließ mit einer an Bedingungen geknüpften Empfehlung.',
    points: [
      { en: 'the expected effects weighed against each other', de: 'die erwarteten Wirkungen, gegeneinander abgewogen', any: ['einerseits', 'andererseits', 'abwag', 'abwaeg', 'abgewogen', 'gegenuber', 'gegenueber', 'wahrend', 'waehrend', 'demgegenuber', 'demgegenueber', 'zwar', 'vorteil', 'nachteil', 'wirkung', 'auswirkung', 'luftqualitat', 'luftqualitaet', 'einzelhandel', 'aufenthaltsqualitat', 'aufenthaltsqualitaet', 'lieferverkehr'] },
      { en: 'the evidence or experience you draw on', de: 'die Belege oder Erfahrungen, auf die du dich stützt', any: ['studie', 'untersuchung', 'erhebung', 'daten', 'zahlen', 'erfahrung', 'beispiel', 'zeigt', 'zeigen', 'belegt', 'belegen', 'ergab', 'laut', 'zufolge', 'prozent', 'evaluation', 'in kopenhagen', 'in gent', 'in pontevedra', 'in oslo', 'in wien', 'in ljubljana'] },
      { en: 'the strongest objection, addressed', de: 'der gewichtigste Einwand, auf den du eingehst', any: ['einwand', 'kritiker', 'befurcht', 'befuerchten', 'befuerchtung', 'befurchtung', 'eingewandt', 'einzuwenden', 'bedenken', 'gegenargument', 'zugegeben', 'allerdings', 'dennoch', 'gleichwohl', 'nichtsdestotrotz', 'umsatzeinbussen', 'umsatz', 'gewerbetreibend', 'anwohner', 'nicht von der hand zu weisen'] },
      { en: 'a recommendation tied to conditions', de: 'eine an Bedingungen geknüpfte Empfehlung', any: ['empfehle', 'empfehlung', 'rate ich', 'unter der bedingung', 'unter der voraussetzung', 'vorausgesetzt', 'sofern', 'nur dann', 'erst dann', 'bedingung', 'voraussetzung', 'geknupft', 'geknuepft', 'befurworte', 'befuerworte', 'schrittweise', 'ubergangsphase', 'uebergangsphase', 'begleitet', 'evaluiert', 'erprobung', 'probephase'] },
    ],
  },
];

export interface Precheck {
  ok: boolean;
  words: number;
  inBand: boolean;
  tooShort: boolean;
  points: (ContentPoint & { hit: boolean })[];
  opening: boolean;
  closing: boolean;
  /** Formal letters only: no du-forms after the salutation. */
  noDu: boolean | null;
}

const FORMAL_OPEN = /sehr geehrte/;
const FORMAL_CLOSE = /mit freundlichen gruessen|freundliche gruesse|mit besten gruessen|hochachtungsvoll/;
const INFORMAL_OPEN = /^(liebe|lieber|hallo|hi|hey|servus|moin)\b/m;
const INFORMAL_CLOSE = /(liebe|viele|herzliche|beste) gruesse|bis bald|bis dann|bis samstag|dein[e]?\b|alles liebe|lg\b/;
const DU_FORMS = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deins|euch|ihr)\b/;
// the formal pronouns are capitalised (Ihr Schreiben, Ihnen); only a lower-case "ihr" is the informal plural
const FORMAL_PRONOUNS = /\bIhr\w*|\bIhnen\b/g;

/** Deterministic checks on a written text, before the model looks at the language. */
export function precheckText(task: WriteTask, text: string): Precheck {
  const n = normalise(text);
  const words = wordCount(text);
  const [lo, hi] = task.words;
  const target = (lo + hi) / 2;
  const tooShort = words < target * 0.5;
  const inBand = words >= lo && words <= hi;
  const points = task.points.map((p) => ({ ...p, hit: p.any.some((k) => n.includes(k)) }));
  const formal = task.register === 'formal';
  const opening = formal ? FORMAL_OPEN.test(n) : INFORMAL_OPEN.test(n);
  const closing = formal ? FORMAL_CLOSE.test(n) : INFORMAL_CLOSE.test(n);
  const noDu = formal ? !DU_FORMS.test(normalise(text.replace(FORMAL_PRONOUNS, ' ')).replace(/sehr geehrte[^,\n]*/g, '')) : null;
  const ok = !tooShort && points.every((p) => p.hit) && opening && closing && noDu !== false && words <= hi * 1.3;
  return { ok, words, inBand, tooShort, points, opening, closing, noDu };
}

export function tasksFor(level: Level): WriteTask[] {
  return WRITE_TASKS.filter((t) => t.level === level);
}
