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
    id: 'a1-postcard-holiday',
    level: 'A1',
    register: 'informal',
    words: [25, 40],
    title: 'A postcard from your holiday',
    titleDe: 'Eine Postkarte aus dem Urlaub',
    prompt: 'Write a postcard to your friend Tom from your holiday at the sea: say where you are, how the weather is, and what you do all day.',
    promptDe: 'Schreib deinem Freund Tom eine Postkarte aus dem Urlaub am Meer: Sag, wo du bist, wie das Wetter ist und was du den ganzen Tag machst.',
    points: [
      { en: 'where you are', de: 'wo du bist', any: ['bin in', 'bin am', 'sind in', 'sind am', 'meer', 'strand', 'insel', 'kuste', 'kueste', 'see', 'italien', 'spanien', 'griechenland', 'kroatien', 'portugal', 'turkei', 'tuerkei'] },
      { en: 'the weather', de: 'das Wetter', any: ['wetter', 'sonne', 'sonnig', 'warm', 'heiss', 'regen', 'regnet', 'grad', 'wind', 'wolke', 'kalt'] },
      { en: 'what you do all day', de: 'was du den ganzen Tag machst', any: ['schwimm', 'bade', 'liege', 'lese', 'esse', 'essen', 'spazier', 'schlafe', 'spiele', 'besichtig', 'fahre', 'wander', 'surfe', 'tauche', 'eis'] },
    ],
  },
  {
    id: 'a1-forum-introduce',
    level: 'A1',
    register: 'informal',
    words: [20, 35],
    title: 'Introduce yourself in the course forum',
    titleDe: 'Stell dich im Kursforum vor',
    prompt: 'Write a short post for your German course forum: say your name and where you come from, which languages you speak, and ask the others where they are from.',
    promptDe: 'Schreib einen kurzen Beitrag für das Forum deines Deutschkurses: Sag, wie du heißt und woher du kommst, welche Sprachen du sprichst, und frag die anderen, woher sie kommen.',
    points: [
      { en: 'your name and where you are from', de: 'dein Name und woher du kommst', any: ['ich heisse', 'mein name', 'ich bin ', 'komme aus', 'aus '] },
      { en: 'the languages you speak', de: 'die Sprachen, die du sprichst', any: ['spreche', 'sprache', 'englisch', 'deutsch', 'spanisch', 'franzosisch', 'franzoesisch', 'turkisch', 'tuerkisch', 'arabisch', 'russisch', 'polnisch', 'italienisch', 'portugiesisch', 'chinesisch', 'ukrainisch', 'hindi', 'urdu', 'persisch'] },
      { en: 'ask the others where they are from', de: 'die anderen fragen, woher sie kommen', any: ['woher kommt ihr', 'woher kommst du', 'woher kommen sie', 'und ihr', 'und du', 'kommt ihr', 'woher seid ihr'] },
    ],
  },
  {
    id: 'a1-family-photo',
    level: 'A1',
    register: 'informal',
    words: [25, 40],
    title: 'A message about a family photo',
    titleDe: 'Eine Nachricht zu einem Familienfoto',
    prompt: 'Your friend Ana sends you a photo of her family. Write back: say who is in your family, how old your parents or your brothers and sisters are, and what one of them does for a living.',
    promptDe: 'Deine Freundin Ana schickt dir ein Foto von ihrer Familie. Schreib zurück: Sag, wer zu deiner Familie gehört, wie alt deine Eltern oder deine Geschwister sind und was einer von ihnen beruflich macht.',
    points: [
      { en: 'who is in your family', de: 'wer zu deiner Familie gehört', any: ['mutter', 'vater', 'eltern', 'bruder', 'schwester', 'geschwister', 'oma', 'opa', 'grossmutter', 'grossvater', 'tochter', 'sohn', 'mein mann', 'meine frau', 'kinder', 'kind', 'familie', 'tante', 'onkel'] },
      { en: 'how old they are', de: 'wie alt sie sind', any: ['jahre alt', 'jahre', 'ist alt', ' alt'] },
      { en: 'what one of them does for a living', de: 'was einer von ihnen beruflich macht', any: ['arbeitet', 'lehrer', 'arzt', 'arztin', 'aerztin', 'ingenieur', 'verkaufer', 'verkaeufer', 'koch', 'kochin', 'koechin', 'student', 'studiert', 'von beruf', 'beruf', 'buro', 'buero', 'firma', 'rentner', 'rente', 'fahrer', 'krankenschwester', 'pfleger', 'friseur', 'mechaniker', 'programmierer', 'hausfrau', 'hausmann'] },
    ],
  },
  {
    id: 'a1-supermarket-message',
    level: 'A1',
    register: 'informal',
    words: [20, 35],
    title: 'A message from the supermarket',
    titleDe: 'Eine Nachricht aus dem Supermarkt',
    prompt: 'You are at the supermarket and your flatmate Jonas is at home. Write him a message: say what you are buying, ask what he still needs, and say what you are not buying because it is too expensive.',
    promptDe: 'Du bist im Supermarkt, dein Mitbewohner Jonas ist zu Hause. Schreib ihm eine Nachricht: Sag, was du kaufst, frag, was er noch braucht, und sag, was du nicht kaufst, weil es zu teuer ist.',
    points: [
      { en: 'what you are buying', de: 'was du kaufst', any: ['kaufe', 'brot', 'milch', 'kase', 'kaese', 'apfel', 'aepfel', 'tomaten', 'kartoffeln', 'butter', 'eier', 'reis', 'nudeln', 'wasser', 'obst', 'gemuse', 'gemuese', 'fleisch', 'wurst', 'joghurt', 'bananen', 'salat', 'zwiebeln', 'saft'] },
      { en: 'ask what he still needs', de: 'fragen, was er noch braucht', any: ['brauchst du', 'was brauchst', 'noch etwas', 'brauchen wir', 'soll ich', 'was fehlt', 'noch was'] },
      { en: 'what you are not buying, and why', de: 'was du nicht kaufst, und warum', any: ['zu teuer', 'teuer', 'kaufe nicht', 'nicht kaufen', 'kein ', 'keine ', 'kostet'] },
    ],
  },
  {
    id: 'a1-my-day-email',
    level: 'A1',
    register: 'informal',
    words: [25, 40],
    title: 'An email about your day',
    titleDe: 'Eine E-Mail über deinen Tag',
    prompt: 'Your pen friend Mia wants to know what a normal day looks like for you. Write her an email: say when you get up, what you do in the morning and in the afternoon, and when you go to bed.',
    promptDe: 'Deine Brieffreundin Mia will wissen, wie ein normaler Tag bei dir aussieht. Schreib ihr eine E-Mail: Sag, wann du aufstehst, was du vormittags und nachmittags machst und wann du ins Bett gehst.',
    points: [
      { en: 'when you get up', de: 'wann du aufstehst', any: ['stehe', 'aufstehe', 'stehe auf', 'wache', 'aufwachen', 'wecker'] },
      { en: 'what you do in the morning and afternoon', de: 'was du vormittags und nachmittags machst', any: ['vormittag', 'morgens', 'am morgen', 'nachmittag', 'arbeite', 'schule', 'universitat', 'universitaet', 'uni', 'kurs', 'fruhstucke', 'fruehstuecke', 'esse', 'lerne', 'koche', 'einkaufen', 'mittag'] },
      { en: 'when you go to bed', de: 'wann du ins Bett gehst', any: ['ins bett', 'schlafe', 'schlafen', 'bett'] },
    ],
  },
  {
    id: 'a1-new-flat-message',
    level: 'A1',
    register: 'informal',
    words: [25, 40],
    title: 'Your new flat',
    titleDe: 'Deine neue Wohnung',
    prompt: 'You have moved. Write a message to your friend Paul: say how many rooms the flat has, which furniture is in your room, and what you like about the flat.',
    promptDe: 'Du bist umgezogen. Schreib deinem Freund Paul eine Nachricht: Sag, wie viele Zimmer die Wohnung hat, welche Möbel in deinem Zimmer stehen und was dir an der Wohnung gefällt.',
    points: [
      { en: 'the rooms', de: 'die Zimmer', any: ['zimmer', 'kuche', 'kueche', 'bad', 'wohnzimmer', 'schlafzimmer', 'balkon', 'flur'] },
      { en: 'the furniture in your room', de: 'die Möbel in deinem Zimmer', any: ['bett', 'tisch', 'stuhl', 'stuhle', 'stuehle', 'schrank', 'sofa', 'regal', 'lampe', 'sessel', 'schreibtisch', 'mobel', 'moebel', 'teppich'] },
      { en: 'what you like about the flat', de: 'was dir an der Wohnung gefällt', any: ['gefallt', 'gefaellt', 'finde', 'schon', 'schoen', 'toll', 'hell', 'gross', 'ruhig', 'mag', 'super', 'gern', 'zentral', 'nah'] },
    ],
  },
  {
    id: 'a1-directions-message',
    level: 'A1',
    register: 'informal',
    words: [25, 40],
    title: 'The way to your place',
    titleDe: 'Der Weg zu dir',
    prompt: 'Your friend Sara is visiting you for the first time. Write her a message: say which bus or train she takes, where she gets off, and how she walks from the stop to your house.',
    promptDe: 'Deine Freundin Sara besucht dich zum ersten Mal. Schreib ihr eine Nachricht: Sag, welchen Bus oder welche Bahn sie nimmt, wo sie aussteigt und wie sie von der Haltestelle zu deinem Haus geht.',
    points: [
      { en: 'which bus or train', de: 'welcher Bus oder welche Bahn', any: ['bus', 'bahn', 'linie', 'u-bahn', 's-bahn', 'strassenbahn', 'tram', 'zug', 'nimm', 'nimmst', 'fahr'] },
      { en: 'where she gets off', de: 'wo sie aussteigt', any: ['steig', 'aussteigen', 'haltestelle', 'station', 'bahnhof'] },
      { en: 'the way on foot', de: 'der Weg zu Fuß', any: ['links', 'rechts', 'geradeaus', 'gehst', 'geh ', 'gehen', 'minuten', 'ecke', 'strasse', 'uber', 'ueber', 'bis zur', 'bis zum', 'zu fuss', 'ampel', 'kreuzung'] },
    ],
  },
  {
    id: 'a1-invite-weekend',
    level: 'A1',
    register: 'informal',
    words: [25, 40],
    title: 'An invitation for the weekend',
    titleDe: 'Eine Einladung fürs Wochenende',
    prompt: 'Write a message to your friend Leo: say what you want to do at the weekend, invite him to come along, and suggest a day and a time.',
    promptDe: 'Schreib deinem Freund Leo eine Nachricht: Sag, was du am Wochenende machen willst, lade ihn ein mitzukommen, und schlag einen Tag und eine Uhrzeit vor.',
    points: [
      { en: 'what you want to do', de: 'was du machen willst', any: ['will ', 'mochte', 'moechte', 'kino', 'schwimmen', 'fussball', 'wandern', 'park', 'konzert', 'essen gehen', 'spielen', 'fahrrad', 'rad fahren', 'museum', 'tanzen', 'kochen', 'machen', 'grillen', 'ausflug', 'see'] },
      { en: 'the invitation', de: 'die Einladung', any: ['kommst du mit', 'hast du lust', 'willst du', 'mochtest du', 'moechtest du', 'komm', 'lust', 'mitkommen', 'zusammen', 'kannst du'] },
      { en: 'a day and a time', de: 'ein Tag und eine Uhrzeit', any: ['samstag', 'sonntag', 'freitag', 'uhr', 'um ', 'halb', 'abend', 'nachmittag', 'vormittag', 'morgen'] },
    ],
  },
  {
    id: 'a1-ill-message-course',
    level: 'A1',
    register: 'informal',
    words: [20, 35],
    title: 'You are ill',
    titleDe: 'Du bist krank',
    prompt: 'You cannot come to the German course today. Write a message to your course friend Nadia: say that you are ill and what hurts, that you have a doctor\'s appointment, and ask her to send you the homework.',
    promptDe: 'Du kannst heute nicht zum Deutschkurs kommen. Schreib deiner Kursfreundin Nadia eine Nachricht: Sag, dass du krank bist und was wehtut, dass du einen Arzttermin hast, und bitte sie, dir die Hausaufgaben zu schicken.',
    points: [
      { en: 'you are ill, and what hurts', de: 'du bist krank, und was wehtut', any: ['krank', 'weh', 'schmerzen', 'fieber', 'kopf', 'hals', 'bauch', 'husten', 'schnupfen', 'erkaltet', 'erkaeltet', 'grippe', 'zahn', 'rucken', 'ruecken'] },
      { en: 'the doctor\'s appointment', de: 'der Arzttermin', any: ['arzt', 'arztin', 'aerztin', 'termin', 'praxis', 'doktor'] },
      { en: 'ask for the homework', de: 'um die Hausaufgaben bitten', any: ['hausaufgabe', 'aufgaben', 'schick', 'schicken', 'senden', 'sende', 'foto'] },
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
    id: 'a2-heating-broken',
    level: 'A2',
    register: 'formal',
    words: [30, 50],
    title: 'The heating is broken',
    titleDe: 'Die Heizung ist kaputt',
    prompt: 'Write a short formal message to your landlord, Herr Krause: the heating in your flat has not worked since Monday. Say what the problem is and since when, ask him to send someone quickly, and say when you are at home.',
    promptDe: 'Schreib eine kurze formelle Nachricht an deinen Vermieter, Herrn Krause: Die Heizung in deiner Wohnung funktioniert seit Montag nicht. Sag, was das Problem ist und seit wann, bitte ihn, schnell jemanden zu schicken, und sag, wann du zu Hause bist.',
    points: [
      { en: 'the problem and since when', de: 'das Problem und seit wann', any: ['heizung', 'kalt', 'funktioniert nicht', 'geht nicht', 'kaputt', 'seit montag', 'seit '] },
      { en: 'ask him to send someone', de: 'bitten, jemanden zu schicken', any: ['schicken', 'senden', 'handwerker', 'techniker', 'reparieren', 'reparatur', 'konnten sie', 'koennten sie', 'so schnell wie moglich', 'so schnell wie moeglich', 'bald'] },
      { en: 'when you are at home', de: 'wann du zu Hause bist', any: ['zu hause', 'zuhause', 'uhr', 'vormittag', 'nachmittag', 'abend', 'ab ', 'bis ', 'am montag', 'am dienstag', 'am mittwoch', 'am donnerstag', 'am freitag', 'am samstag', 'wochenende', 'erreichbar'] },
    ],
  },
  {
    id: 'a2-weekend-report',
    level: 'A2',
    register: 'informal',
    words: [30, 50],
    title: 'How was your weekend?',
    titleDe: 'Wie war dein Wochenende?',
    prompt: 'Your friend Tim asks how your weekend was. Write back: tell him what you did on Saturday and Sunday, say how it was, and ask him what he did.',
    promptDe: 'Dein Freund Tim fragt, wie dein Wochenende war. Schreib zurück: Erzähl ihm, was du am Samstag und am Sonntag gemacht hast, sag, wie es war, und frag ihn, was er gemacht hat.',
    points: [
      { en: 'what you did', de: 'was du gemacht hast', any: ['habe ich', 'bin ich', 'gemacht', 'gegangen', 'gefahren', 'besucht', 'gespielt', 'gekocht', 'gesehen', 'getroffen', 'gelesen', 'geschlafen', 'war ich', 'waren wir', 'haben wir', 'sind wir'] },
      { en: 'how it was', de: 'wie es war', any: ['war schon', 'war schoen', 'war toll', 'war super', 'war langweilig', 'war anstrengend', 'war lustig', 'hat spass', 'war es', 'es war', 'fand ich', 'war sehr', 'war richtig'] },
      { en: 'ask what he did', de: 'fragen, was er gemacht hat', any: ['und du', 'was hast du', 'wie war dein', 'hast du', 'was habt ihr', 'und bei dir'] },
    ],
  },
  {
    id: 'a2-return-jacket',
    level: 'A2',
    register: 'formal',
    words: [30, 50],
    title: 'An email to an online shop',
    titleDe: 'Eine E-Mail an einen Onlineshop',
    prompt: 'You ordered a jacket online, but it is too small and a button is missing. Write an email to the shop: say what you ordered and when, what the problem is, and ask politely whether you can exchange it or get your money back.',
    promptDe: 'Du hast online eine Jacke bestellt, aber sie ist zu klein und ein Knopf fehlt. Schreib eine E-Mail an den Shop: Sag, was du wann bestellt hast, was das Problem ist, und frag höflich, ob du sie umtauschen oder dein Geld zurückbekommen kannst.',
    points: [
      { en: 'the order and when', de: 'die Bestellung und wann', any: ['bestellt', 'bestellung', 'jacke', 'am ', 'letzte woche', 'vor ', 'gekauft', 'bestellnummer'] },
      { en: 'the problem', de: 'das Problem', any: ['zu klein', 'klein', 'knopf', 'fehlt', 'kaputt', 'problem', 'leider', 'passt nicht', 'beschadigt', 'beschaedigt'] },
      { en: 'exchange or refund, asked politely', de: 'Umtausch oder Geld zurück, höflich erfragt', any: ['umtausch', 'umtauschen', 'zuruck', 'zurueck', 'geld', 'erstatten', 'konnte ich', 'koennte ich', 'konnten sie', 'koennten sie', 'ware es moglich', 'waere es moeglich', 'grossere', 'groessere', 'wurde', 'wuerde'] },
    ],
  },
  {
    id: 'a2-weekend-job-email',
    level: 'A2',
    register: 'formal',
    words: [35, 50],
    title: 'Applying for a weekend job',
    titleDe: 'Bewerbung für einen Wochenendjob',
    prompt: 'A café is looking for help at the weekend. Write a short email: say which job you are interested in, what experience you have and since when, and when you can start.',
    promptDe: 'Ein Café sucht Hilfe am Wochenende. Schreib eine kurze E-Mail: Sag, für welche Stelle du dich interessierst, welche Erfahrung du hast und seit wann, und wann du anfangen kannst.',
    points: [
      { en: 'the job you want', de: 'die Stelle, die du willst', any: ['stelle', 'job', 'anzeige', 'bewerbe', 'bewerbung', 'interessiere', 'aushilfe', 'wochenende', 'cafe', 'café', 'kellner', 'service', 'kuche', 'kueche'] },
      { en: 'your experience and since when', de: 'deine Erfahrung und seit wann', any: ['erfahrung', 'seit ', 'gearbeitet', 'arbeite', 'jahre', 'monate', 'schon', 'habe ich'] },
      { en: 'when you can start', de: 'wann du anfangen kannst', any: ['anfangen', 'beginnen', 'ab ', 'konnte', 'koennte', 'kann ich', 'sofort', 'nachste', 'naechste', 'ab sofort'] },
    ],
  },
  {
    id: 'a2-summer-plans-email',
    level: 'A2',
    register: 'informal',
    words: [35, 50],
    title: 'Plans for the summer',
    titleDe: 'Pläne für den Sommer',
    prompt: 'Write an email to your friend Elena about your next holiday: say where you will go and with whom, how you will travel there, and what you will do there.',
    promptDe: 'Schreib deiner Freundin Elena eine E-Mail über deinen nächsten Urlaub: Sag, wohin du fahren wirst und mit wem, wie du dorthin reist und was du dort machen wirst.',
    points: [
      { en: 'where to and with whom', de: 'wohin und mit wem', any: ['fahre', 'fahren', 'fliege', 'reise', 'nach ', 'mit meiner', 'mit meinem', 'mit meinen', 'mit freunden', 'familie', 'allein', 'werde', 'werden wir'] },
      { en: 'how you travel', de: 'wie du reist', any: ['zug', 'bahn', 'auto', 'flugzeug', 'fliegen', 'bus', 'fahrrad', 'schiff', 'fahre mit', 'fahren mit', 'fliegen wir'] },
      { en: 'what you will do there', de: 'was du dort machen wirst', any: ['wandern', 'schwimmen', 'strand', 'meer', 'berge', 'besichtigen', 'museum', 'stadt', 'essen', 'ausruhen', 'entspannen', 'baden', 'rad', 'werde ich', 'wir werden', 'mochte', 'moechte', 'sonne', 'camping', 'zelt'] },
    ],
  },
  {
    id: 'a2-library-email',
    level: 'A2',
    register: 'formal',
    words: [30, 50],
    title: 'An email to the library',
    titleDe: 'Eine E-Mail an die Bibliothek',
    prompt: 'Write an email to the city library: ask whether they have a German textbook for your level, how long you can borrow it, and whether you can extend the loan online.',
    promptDe: 'Schreib eine E-Mail an die Stadtbibliothek: Frag, ob sie ein Deutsch-Lehrbuch für dein Niveau haben, wie lange du es ausleihen kannst und ob du die Ausleihe online verlängern kannst.',
    points: [
      { en: 'the book you are looking for', de: 'das Buch, das du suchst', any: ['lehrbuch', 'buch', 'bucher', 'buecher', 'deutsch', 'niveau', 'a2', 'haben sie', 'gibt es', 'suche'] },
      { en: 'how long you can borrow it', de: 'wie lange du es ausleihen kannst', any: ['wie lange', 'ausleihen', 'leihen', 'wochen', 'tage', 'frist', 'leihfrist'] },
      { en: 'extending online', de: 'online verlängern', any: ['verlangern', 'verlaengern', 'online', 'internet', 'app', 'website', 'webseite'] },
    ],
  },
  {
    id: 'a2-describe-friend',
    level: 'A2',
    register: 'informal',
    words: [35, 50],
    title: 'Describe a good friend',
    titleDe: 'Beschreib eine gute Freundin oder einen guten Freund',
    prompt: 'Your course chat is collecting posts about best friends. Write a short post about a friend: describe how they look, what their character is like, and explain why you like them.',
    promptDe: 'In eurem Kurschat sammelt ihr Beiträge über beste Freundinnen und Freunde. Schreib einen kurzen Beitrag über eine Freundin oder einen Freund: Beschreib, wie sie oder er aussieht, wie der Charakter ist, und erklär, warum du sie oder ihn magst.',
    points: [
      { en: 'how they look', de: 'wie sie oder er aussieht', any: ['haare', 'augen', 'gross', 'klein', 'schlank', 'brille', 'bart', 'lockig', 'blond', 'dunkel', 'sieht', 'aussehen', 'jung', 'sportlich', 'hubsch', 'huebsch', 'lange', 'kurze'] },
      { en: 'their character', de: 'der Charakter', any: ['nett', 'freundlich', 'lustig', 'ruhig', 'ehrlich', 'hilfsbereit', 'sympathisch', 'offen', 'geduldig', 'klug', 'mutig', 'witzig', 'zuverlassig', 'zuverlaessig', 'charakter', 'frohlich', 'froehlich', 'schuchtern', 'schuechtern', 'kreativ'] },
      { en: 'why you like them', de: 'warum du sie oder ihn magst', any: ['weil', 'mag ich', 'ich mag', 'deshalb', 'darum', 'gern', 'immer fur mich', 'immer fuer mich', 'hilft mir', 'zuhort', 'zuhoert', 'lachen', 'verstehen uns', 'vertrauen'] },
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
    id: 'b1-complaint-online-order',
    level: 'B1',
    register: 'formal',
    words: [60, 90],
    title: 'A complaint about an online order',
    titleDe: 'Eine Beschwerde über eine Online-Bestellung',
    prompt: 'You ordered a lamp online (order number 48213). It arrived after three weeks, and the glass is broken. Write a formal e-mail to the shop: describe the problem, say what you want (a replacement or your money back), and ask how to send the lamp back.',
    promptDe: 'Du hast online eine Lampe bestellt (Bestellnummer 48213). Sie ist erst nach drei Wochen gekommen, und das Glas ist kaputt. Schreib eine formelle E-Mail an den Shop: Beschreib das Problem, sag, was du möchtest (Ersatz oder dein Geld zurück), und frag, wie du die Lampe zurückschicken kannst.',
    points: [
      { en: 'describe the problem', de: 'das Problem beschreiben', any: ['kaputt', 'beschadigt', 'beschaedigt', 'zerbrochen', 'gebrochen', 'glas', 'drei wochen', 'zu spat', 'zu spaet', 'verspatet', 'verspaetet', '48213', 'defekt'] },
      { en: 'what you want', de: 'was du möchtest', any: ['ersatz', 'neue lampe', 'umtausch', 'geld zuruck', 'geld zurueck', 'erstatt', 'ruckzahlung', 'rueckzahlung', 'zuruckerstatten', 'zurueckerstatten', 'ich mochte', 'ich moechte', 'bitte ich sie', 'erwarte'] },
      { en: 'ask how to send it back', de: 'fragen, wie du sie zurückschicken kannst', any: ['zuruckschicken', 'zurueckschicken', 'zurucksenden', 'zuruecksenden', 'rucksendung', 'ruecksendung', 'retoure', 'versandkosten', 'etikett', 'wie kann ich', 'wie soll ich', 'wohin'] },
    ],
  },
  {
    id: 'b1-flat-enquiry',
    level: 'B1',
    register: 'formal',
    words: [60, 90],
    title: 'Asking about a flat',
    titleDe: 'Anfrage zu einer Wohnung',
    prompt: 'You have seen an advertisement for a two-room flat. Write an email to the landlord, Herr Krüger: introduce yourself briefly and say why you are looking for a flat, ask about three things in the flat or the contract (for example the deposit, the heating costs, the notice period), and ask for a viewing date.',
    promptDe: 'Du hast eine Anzeige für eine Zwei-Zimmer-Wohnung gesehen. Schreib eine E-Mail an den Vermieter, Herrn Krüger: Stell dich kurz vor und sag, warum du eine Wohnung suchst, frag nach drei Dingen zur Wohnung oder zum Vertrag (zum Beispiel Kaution, Heizkosten, Kündigungsfrist), und bitte um einen Besichtigungstermin.',
    points: [
      { en: 'who you are and why you are looking', de: 'wer du bist und warum du suchst', any: ['ich bin', 'ich heisse', 'ich arbeite', 'studiere', 'suche', 'weil', 'da ich', 'umziehen', 'ziehe', 'beruflich', 'familie'] },
      { en: 'three questions about the flat or the contract', de: 'drei Fragen zur Wohnung oder zum Vertrag', any: ['kaution', 'nebenkosten', 'heizkosten', 'kundigungsfrist', 'kuendigungsfrist', 'vertrag', 'miete', 'haustiere', 'balkon', 'keller', 'stellplatz', 'wie hoch', 'ist die wohnung', 'ab wann', 'einbaukuche', 'einbaukueche', 'renoviert'] },
      { en: 'a viewing date', de: 'ein Besichtigungstermin', any: ['besichtigung', 'besichtigen', 'termin', 'anschauen', 'ansehen', 'wann konnte', 'wann koennte'] },
    ],
  },
  {
    id: 'b1-forum-healthy-week',
    level: 'B1',
    register: 'informal',
    words: [70, 100],
    title: 'A forum post on healthy living',
    titleDe: 'Ein Forumsbeitrag zu gesundem Leben',
    prompt: 'A forum asks: "Healthy food and sport — how do you manage it in a full week?" Write a post: say what you eat and how much sport you do, describe a problem you have with it (for example stress or no time), and give the others one piece of advice.',
    promptDe: 'In einem Forum steht die Frage: „Gesund essen und Sport – wie schafft ihr das in einer vollen Woche?“ Schreib einen Beitrag: Sag, was du isst und wie viel Sport du machst, beschreib ein Problem, das du damit hast (zum Beispiel Stress oder keine Zeit), und gib den anderen einen Tipp.',
    points: [
      { en: 'what you eat and how much sport you do', de: 'was du isst und wie viel Sport du machst', any: ['esse', 'essen', 'gemuse', 'gemuese', 'obst', 'salat', 'zucker', 'fleisch', 'vegetarisch', 'koche', 'sport', 'laufe', 'joggen', 'fitness', 'schwimmen', 'rad', 'yoga', 'mal pro woche', 'mal in der woche', 'trainiere'] },
      { en: 'a problem you have with it', de: 'ein Problem, das du damit hast', any: ['problem', 'stress', 'keine zeit', 'wenig zeit', 'mude', 'muede', 'schwer', 'schwierig', 'obwohl', 'trotzdem', 'leider', 'schaffe', 'fast food', 'susses', 'suesses'] },
      { en: 'one piece of advice', de: 'ein Tipp', any: ['tipp', 'rat', 'empfehle', 'solltet', 'solltest', 'am besten', 'versucht', 'probiert', 'ich rate', 'mein tipp', 'hilft'] },
    ],
  },
  {
    id: 'b1-bank-account-email',
    level: 'B1',
    register: 'formal',
    words: [60, 90],
    title: 'An email to the bank',
    titleDe: 'Eine E-Mail an die Bank',
    prompt: 'You want to open a current account. Write an email to the bank: say which account you need and what for, ask which documents are required and what the account costs per month, and ask whether the account can be opened online or only in the branch.',
    promptDe: 'Du möchtest ein Girokonto eröffnen. Schreib eine E-Mail an die Bank: Sag, welches Konto du brauchst und wofür, frag, welche Unterlagen nötig sind und was das Konto im Monat kostet, und frag, ob das Konto online oder nur in der Filiale eröffnet werden kann.',
    points: [
      { en: 'the account and what for', de: 'das Konto und wofür', any: ['konto', 'girokonto', 'eroffnen', 'eroeffnen', 'gehalt', 'miete', 'uberweisung', 'ueberweisung', 'karte', 'brauche', 'mochte', 'moechte'] },
      { en: 'documents and monthly costs', de: 'Unterlagen und Kosten im Monat', any: ['unterlagen', 'dokumente', 'ausweis', 'pass', 'meldebescheinigung', 'kosten', 'kostet', 'gebuhr', 'gebuehr', 'gebuhren', 'gebuehren', 'monat', 'kostenlos', 'kontofuhrung', 'kontofuehrung'] },
      { en: 'online or in the branch', de: 'online oder in der Filiale', any: ['online', 'filiale', 'vor ort', 'termin', 'eroffnet werden', 'eroeffnet werden', 'im internet', 'per video', 'videoident'] },
    ],
  },
  {
    id: 'b1-hotel-complaint',
    level: 'B1',
    register: 'formal',
    words: [60, 90],
    title: 'A complaint to a hotel',
    titleDe: 'Eine Beschwerde an ein Hotel',
    prompt: 'After your trip you write to the hotel: say when you stayed there and what had been booked, describe what went wrong (for example the room, the noise, the breakfast) and what had been promised, and say what you expect from the hotel now.',
    promptDe: 'Nach deiner Reise schreibst du an das Hotel: Sag, wann du dort warst und was gebucht war, beschreib, was schiefgegangen ist (zum Beispiel Zimmer, Lärm, Frühstück) und was versprochen worden war, und sag, was du jetzt vom Hotel erwartest.',
    points: [
      { en: 'the stay and the booking', de: 'der Aufenthalt und die Buchung', any: ['vom ', 'bis ', 'ubernachtet', 'uebernachtet', 'gebucht', 'buchung', 'reservierung', 'zimmer', 'nacht', 'nachte', 'naechte', 'aufenthalt'] },
      { en: 'what went wrong and what was promised', de: 'was schiefging und was versprochen war', any: ['leider', 'larm', 'laerm', 'laut', 'schmutzig', 'dreckig', 'kaputt', 'kalt', 'fruhstuck', 'fruehstueck', 'nicht funktioniert', 'problem', 'enttauscht', 'enttaeuscht', 'obwohl', 'versprochen', 'hatte', 'hatten', 'zugesagt'] },
      { en: 'what you expect now', de: 'was du jetzt erwartest', any: ['erwarte', 'erstattung', 'zuruck', 'zurueck', 'entschadigung', 'entschaedigung', 'gutschein', 'bitte ich', 'fordere', 'preisnachlass', 'rabatt', 'stellungnahme', 'antwort', 'teil des preises'] },
    ],
  },
  {
    id: 'b1-forum-screen-time',
    level: 'B1',
    register: 'informal',
    words: [70, 100],
    title: 'A forum post on screen time',
    titleDe: 'Ein Forumsbeitrag zur Bildschirmzeit',
    prompt: 'A forum asks: "How much time do you spend on your phone — and is that too much?" Write a post: say how and how long you use your phone every day, say what annoys you about it and what you look forward to without it, and give your opinion on whether rules for screen time make sense.',
    promptDe: 'In einem Forum steht die Frage: „Wie viel Zeit verbringt ihr am Handy – und ist das zu viel?“ Schreib einen Beitrag: Sag, wie und wie lange du dein Handy jeden Tag benutzt, sag, was dich daran stört und worauf du dich ohne Handy freust, und gib deine Meinung dazu, ob Regeln für die Bildschirmzeit sinnvoll sind.',
    points: [
      { en: 'how and how long you use your phone', de: 'wie und wie lange du dein Handy benutzt', any: ['stunden', 'minuten', 'pro tag', 'jeden tag', 'taglich', 'taeglich', 'benutze', 'nutze', 'handy', 'smartphone', 'social media', 'instagram', 'tiktok', 'nachrichten', 'videos', 'whatsapp'] },
      { en: 'what annoys you, what you look forward to', de: 'was dich stört, worauf du dich freust', any: ['stort', 'stoert', 'argere', 'aergere', 'nervt', 'freue mich', 'darauf', 'daruber', 'darueber', 'ohne handy', 'abschalten', 'genervt'] },
      { en: 'your opinion on rules', de: 'deine Meinung zu Regeln', any: ['meiner meinung', 'ich finde', 'ich denke', 'ich glaube', 'regeln', 'sinnvoll', 'bildschirmzeit', 'sollte', 'sollten', 'dafur', 'dafuer', 'dagegen', 'limit'] },
    ],
  },
  {
    id: 'b1-street-festival-message',
    level: 'B1',
    register: 'informal',
    words: [60, 90],
    title: 'Invitation to a street festival',
    titleDe: 'Einladung zu einem Straßenfest',
    prompt: 'Your street is organising a festival without plastic and waste. Write a message to the neighbours\' group: say when and where the festival is and what is planned, explain the two rules on waste and ask everyone to bring something, and say what you will bring and what you will not bring.',
    promptDe: 'Eure Straße organisiert ein Fest ohne Plastik und Müll. Schreib eine Nachricht an die Nachbarschaftsgruppe: Sag, wann und wo das Fest ist und was geplant ist, erklär die zwei Regeln zum Müll und bitte alle, etwas mitzubringen, und sag, was du mitbringst und was du nicht mitbringst.',
    points: [
      { en: 'when, where and what is planned', de: 'wann, wo und was geplant ist', any: ['am ', 'um ', 'uhr', 'strasse', 'hof', 'park', 'platz', 'musik', 'grillen', 'spiele', 'kuchen', 'fest', 'samstag', 'sonntag'] },
      { en: 'the two rules and the request', de: 'die zwei Regeln und die Bitte', any: ['regel', 'kein plastik', 'ohne plastik', 'mull', 'muell', 'abfall', 'mehrweg', 'eigene', 'mitbringen', 'teller', 'becher', 'trennen', 'recycling', 'sowohl', 'weder', 'nicht nur', 'sondern auch', 'bitte bringt'] },
      { en: 'what you bring and what not', de: 'was du mitbringst und was nicht', any: ['bringe', 'mitbringe', 'ich bringe', 'salat', 'kuchen', 'getranke', 'getraenke', 'musik', 'tisch', 'nicht', 'kein'] },
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
    id: 'b2-forum-smartphones-school',
    level: 'B2',
    register: 'informal',
    words: [150, 200],
    title: 'A forum post: smartphones in school',
    titleDe: 'Ein Forumsbeitrag: Smartphones in der Schule',
    prompt: 'In an online forum, parents are discussing whether smartphones should be banned in schools. Write a post (about 170 words): say what you think, give arguments for and against, describe an experience of your own, and make a suggestion.',
    promptDe: 'In einem Online-Forum diskutieren Eltern, ob Smartphones in der Schule verboten werden sollten. Schreib einen Beitrag (ca. 170 Wörter): Sag, was du denkst, nenne Argumente dafür und dagegen, beschreib eine eigene Erfahrung und mach einen Vorschlag.',
    points: [
      { en: 'your opinion', de: 'deine Meinung', any: ['meiner meinung', 'ich finde', 'ich denke', 'ich glaube', 'ich bin der meinung', 'meines erachtens', 'ich halte', 'aus meiner sicht', 'fur mich', 'fuer mich'] },
      { en: 'arguments for and against', de: 'Argumente dafür und dagegen', any: ['einerseits', 'andererseits', 'dafur spricht', 'dafuer spricht', 'dagegen spricht', 'vorteil', 'nachteil', 'zwar', 'allerdings', 'jedoch', 'ablenk', 'konzentr', 'mobbing', 'notfall', 'erreichbar'] },
      { en: 'an experience of your own', de: 'eine eigene Erfahrung', any: ['erfahrung', 'bei uns', 'mein sohn', 'meine tochter', 'meine kinder', 'mein kind', 'ich habe erlebt', 'ich habe gesehen', 'in meiner schule', 'als ich', 'bei meinem', 'bei meiner', 'erlebt', 'selbst'] },
      { en: 'a suggestion', de: 'ein Vorschlag', any: ['vorschlag', 'ich schlage vor', 'man konnte', 'man koennte', 'man sollte', 'ich wurde', 'ich wuerde', 'regel', 'kompromiss', 'losung', 'loesung', 'wahrend des unterrichts', 'waehrend des unterrichts', 'in der pause', 'ausschalten', 'abgeben', 'handyfrei'] },
    ],
  },
  {
    id: 'b2-deposit-letter',
    level: 'B2',
    register: 'formal',
    words: [110, 180],
    title: 'Getting your deposit back',
    titleDe: 'Die Kaution zurückfordern',
    prompt: 'You moved out of your flat two months ago, handed it over in good condition, and still have not received your deposit. Write to your former landlord, Herr Albrecht: describe the hand-over and the condition of the flat, refer to the agreed deadline and ask for the deposit to be paid back by a date, and say what you will do if it is not.',
    promptDe: 'Du bist vor zwei Monaten aus deiner Wohnung ausgezogen, hast sie in gutem Zustand übergeben und hast deine Kaution immer noch nicht zurück. Schreib an deinen ehemaligen Vermieter, Herrn Albrecht: Beschreib die Übergabe und den Zustand der Wohnung, verweis auf die vereinbarte Frist und fordere die Rückzahlung der Kaution bis zu einem Datum, und sag, was du tust, wenn sie nicht kommt.',
    points: [
      { en: 'the hand-over and the condition', de: 'die Übergabe und der Zustand', any: ['ubergabe', 'uebergabe', 'ubergeben', 'uebergeben', 'protokoll', 'zustand', 'renoviert', 'gestrichen', 'gereinigt', 'sauber', 'ausgezogen', 'schlussel', 'schluessel', 'mangel', 'maengel', 'besenrein'] },
      { en: 'the deadline and the demand', de: 'die Frist und die Forderung', any: ['frist', 'vereinbart', 'kaution', 'zuruckzahlen', 'zurueckzahlen', 'ruckzahlung', 'rueckzahlung', 'uberweisen', 'ueberweisen', 'bis zum', 'spatestens', 'spaetestens', 'fordere', 'bitte ich sie', 'auszahlung'] },
      { en: 'what you will do otherwise', de: 'was du sonst tust', any: ['andernfalls', 'sonst', 'anwalt', 'anwaltin', 'anwaeltin', 'mieterverein', 'rechtliche schritte', 'gericht', 'mahnung', 'behalte ich mir vor', 'einschalten', 'mahnverfahren'] },
    ],
  },
  {
    id: 'b2-integration-course-letter',
    level: 'B2',
    register: 'formal',
    words: [120, 180],
    title: 'A letter about an integration course',
    titleDe: 'Ein Brief zum Integrationskurs',
    prompt: 'A friend of yours has been waiting for months for a place in an integration course. Write to the adult education centre on her behalf: describe her situation (since when she has been in Germany, why the course matters for her work), explain the consequences of the waiting time, and ask for a place on the next course or an alternative.',
    promptDe: 'Eine Freundin wartet seit Monaten auf einen Platz im Integrationskurs. Schreib in ihrem Namen an die Volkshochschule: Beschreib ihre Situation (seit wann sie in Deutschland ist, warum der Kurs für ihre Arbeit wichtig ist), erklär die Folgen der Wartezeit und bitte um einen Platz im nächsten Kurs oder um eine Alternative.',
    points: [
      { en: 'her situation', de: 'ihre Situation', any: ['seit ', 'in deutschland', 'freundin', 'bekannte', 'arbeit', 'beruf', 'stelle', 'anerkennung', 'sprachkenntnisse', 'b1', 'niveau', 'lebt', 'wohnt', 'kam', 'arbeitgeber'] },
      { en: 'the consequences of waiting', de: 'die Folgen der Wartezeit', any: ['folgen', 'wegen', 'aufgrund', 'infolge', 'trotz', 'wartezeit', 'warten', 'verliert', 'kann nicht', 'ohne den kurs', 'schwierig', 'problem', 'verzogert', 'verzoegert', 'mangels', 'angesichts'] },
      { en: 'the request', de: 'die Bitte', any: ['bitte', 'platz', 'nachsten kurs', 'naechsten kurs', 'alternative', 'online', 'abendkurs', 'andere', 'warteliste', 'mitteilen', 'ruckmeldung', 'rueckmeldung', 'dankbar'] },
    ],
  },
  {
    id: 'b2-forum-voting-age',
    level: 'B2',
    register: 'informal',
    words: [150, 200],
    title: 'Voting at sixteen?',
    titleDe: 'Wählen mit sechzehn?',
    prompt: 'An online forum discusses lowering the voting age to sixteen. Write a post: give arguments for and against, refer to what another user wrote and say where you agree or disagree, and state your own position with a reason.',
    promptDe: 'In einem Onlineforum wird diskutiert, ob das Wahlalter auf sechzehn gesenkt werden soll. Schreib einen Beitrag: Nenn Argumente dafür und dagegen, beziehe dich darauf, was ein anderer Nutzer geschrieben hat, und sag, wo du zustimmst oder widersprichst, und formulier deine eigene Position mit Begründung.',
    points: [
      { en: 'arguments for and against', de: 'Argumente dafür und dagegen', any: ['dafur', 'dafuer', 'dagegen', 'einerseits', 'andererseits', 'vorteil', 'nachteil', 'argument', 'zum einen', 'zum anderen', 'spricht', 'befurworter', 'befuerworter', 'gegner'] },
      { en: 'a reference to another post', de: 'ein Bezug auf einen anderen Beitrag', any: ['geschrieben hat', 'schreibt', 'meint', '@', 'nutzer', 'vorredner', 'recht', 'stimme', 'widerspreche', 'sehe ich anders', 'da bin ich', 'beitrag von', 'wie ', 'worauf'] },
      { en: 'your own position with a reason', de: 'deine Position mit Begründung', any: ['meiner meinung', 'ich bin der meinung', 'ich finde', 'ich denke', 'ich halte', 'ich bin dafur', 'ich bin dafuer', 'ich bin dagegen', 'deshalb', 'daher', 'weil', 'denn', 'aus diesem grund'] },
    ],
  },
  {
    id: 'b2-survey-report-email',
    level: 'B2',
    register: 'formal',
    words: [120, 180],
    title: 'A short report with figures',
    titleDe: 'Ein kurzer Bericht mit Zahlen',
    prompt: 'The editor of your company newsletter, Frau Lang, has asked you for a short report on a survey: 62 % of colleagues come by car, 23 % by public transport, 15 % by bike or on foot; 70 % would switch if there were a job ticket. Write her an email: describe the figures, make an assumption about how the numbers will develop, and propose two measures.',
    promptDe: 'Die Redakteurin eures Firmen-Newsletters, Frau Lang, hat dich um einen kurzen Bericht über eine Umfrage gebeten: 62 % der Kolleginnen und Kollegen kommen mit dem Auto, 23 % mit Bus und Bahn, 15 % mit dem Rad oder zu Fuß; 70 % würden umsteigen, wenn es ein Jobticket gäbe. Schreib ihr eine E-Mail: Beschreib die Zahlen, stell eine Vermutung an, wie sich die Zahlen entwickeln werden, und schlag zwei Maßnahmen vor.',
    points: [
      { en: 'the figures described', de: 'die Zahlen beschrieben', any: ['62', '23', '15', '70', 'prozent', '%', 'mehrheit', 'drittel', 'viertel', 'umfrage', 'befragten', 'knapp', 'gut die'] },
      { en: 'an assumption about the future', de: 'eine Vermutung zur Zukunft', any: ['wird', 'werden', 'wahrscheinlich', 'vermutlich', 'durfte', 'duerfte', 'wohl', 'voraussichtlich', 'in zukunft', 'kunftig', 'kuenftig', 'in den nachsten', 'in den naechsten', 'steigen', 'sinken', 'zunehmen', 'abnehmen'] },
      { en: 'two measures proposed', de: 'zwei Maßnahmen vorgeschlagen', any: ['massnahme', 'massnahmen', 'vorschlag', 'schlage vor', 'jobticket', 'fahrradstellplatze', 'fahrradstellplaetze', 'homeoffice', 'fahrgemeinschaft', 'dusche', 'pramie', 'praemie', 'sollte', 'konnte', 'koennte', 'einfuhren', 'einfuehren', 'zum einen', 'zum anderen', 'erstens', 'zweitens'] },
    ],
  },
  {
    id: 'b2-advice-for-friend',
    level: 'B2',
    register: 'informal',
    words: [130, 180],
    title: 'Advice for a friend',
    titleDe: 'Ein Rat für einen Freund',
    prompt: 'Your friend Daniel writes that he seems calm at work but is actually very stressed and sleeps badly. Write back: describe how you see his situation and what might be behind it, tell him about a similar experience of your own, and give him two concrete pieces of advice.',
    promptDe: 'Dein Freund Daniel schreibt, dass er bei der Arbeit ruhig wirkt, in Wirklichkeit aber sehr gestresst ist und schlecht schläft. Schreib zurück: Beschreib, wie du seine Situation siehst und was dahinterstecken könnte, erzähl von einer ähnlichen Erfahrung von dir, und gib ihm zwei konkrete Ratschläge.',
    points: [
      { en: 'his situation and what may be behind it', de: 'seine Situation und was dahintersteckt', any: ['wirkst', 'scheinst', 'als ob', 'als wurdest', 'als wuerdest', 'in wirklichkeit', 'eigentlich', 'dahinter', 'stress', 'gestresst', 'schlafst', 'schlaefst', 'druck', 'angst', 'sorgen', 'erschopft', 'erschoepft', 'klingt'] },
      { en: 'a similar experience of yours', de: 'eine ähnliche Erfahrung von dir', any: ['ich hatte', 'mir ging es', 'bei mir', 'damals', 'vor einem jahr', 'vor zwei jahren', 'ahnlich', 'aehnlich', 'kenne ich', 'habe ich auch', 'als ich', 'letztes jahr', 'selbst erlebt'] },
      { en: 'two concrete pieces of advice', de: 'zwei konkrete Ratschläge', any: ['rat', 'ratschlag', 'tipp', 'solltest', 'versuch', 'probier', 'an deiner stelle', 'wurde ich', 'wuerde ich', 'sprich', 'rede', 'arzt', 'pause', 'sport', 'schlaf', 'entspann', 'doch mal', 'ruhig mal', 'erstens', 'zweitens', 'zum einen', 'zum anderen'] },
    ],
  },
  {
    id: 'b2-review-for-magazine',
    level: 'B2',
    register: 'formal',
    words: [130, 190],
    title: 'A review for a city magazine',
    titleDe: 'Eine Rezension für ein Stadtmagazin',
    prompt: 'The culture editor of a city magazine, Herr Vogt, has asked you for a short review of an exhibition, a film or a book. Write him an email with your review: describe what it is about and what you found strong or weak, report what the artist, author or director said about the work in an interview, and give a recommendation and say for whom.',
    promptDe: 'Der Kulturredakteur eines Stadtmagazins, Herr Vogt, hat dich um eine kurze Rezension zu einer Ausstellung, einem Film oder einem Buch gebeten. Schreib ihm eine E-Mail mit deiner Rezension: Beschreib, worum es geht und was du stark oder schwach fandest, gib wieder, was die Künstlerin, der Autor oder die Regisseurin in einem Interview über das Werk gesagt hat, und sprich eine Empfehlung aus und sag, für wen.',
    points: [
      { en: 'the content and your judgement', de: 'der Inhalt und dein Urteil', any: ['handelt von', 'geht um', 'erzahlt', 'erzaehlt', 'zeigt', 'thema', 'gelungen', 'uberzeugend', 'ueberzeugend', 'schwach', 'langweilig', 'beeindruckend', 'stark', 'fand ich', 'gefiel', 'gefallen', 'enttauscht', 'enttaeuscht', 'eindrucksvoll'] },
      { en: 'what the artist said, reported', de: 'was die Künstlerin sagte, wiedergegeben', any: ['sagte', 'erklarte', 'erklaerte', 'meinte', 'betonte', 'laut', 'zufolge', 'im interview', 'habe', 'sei', 'wolle', 'gehe', 'aussage'] },
      { en: 'a recommendation, and for whom', de: 'eine Empfehlung, und für wen', any: ['empfehle', 'empfehlung', 'lohnt sich', 'sollte man', 'sehenswert', 'lesenswert', 'fur alle', 'fuer alle', 'wer ', 'nichts fur', 'nichts fuer', 'unbedingt', 'geeignet', 'besonders fur', 'besonders fuer'] },
    ],
  },
  {
    id: 'b2-article-summary-group',
    level: 'B2',
    register: 'informal',
    words: [120, 170],
    title: 'Summarising an article',
    titleDe: 'Einen Artikel zusammenfassen',
    prompt: 'Write a message to your study group summarising an article on globalisation that you have read (for example about supply chains, cheap clothes or fair trade): name the topic and the main claim, give the two or three most important arguments in your own words, and end with one sentence on what you think of it.',
    promptDe: 'Schreib eine Nachricht an deine Lerngruppe, in der du einen Artikel zur Globalisierung zusammenfasst, den du gelesen hast (zum Beispiel über Lieferketten, billige Kleidung oder fairen Handel): Nenn das Thema und die Hauptaussage, gib die zwei oder drei wichtigsten Argumente in eigenen Worten wieder, und schließ mit einem Satz dazu, was du davon hältst.',
    points: [
      { en: 'the topic and the main claim', de: 'das Thema und die Hauptaussage', any: ['artikel', 'text', 'thema', 'geht es um', 'handelt', 'hauptaussage', 'these', 'behauptet', 'autor', 'autorin', 'zeigt', 'lieferkette', 'handel', 'globalisierung', 'kleidung', 'billig', 'fair'] },
      { en: 'the main arguments in your words', de: 'die wichtigsten Argumente in eigenen Worten', any: ['erstens', 'zweitens', 'drittens', 'zunachst', 'zunaechst', 'ausserdem', 'daruber hinaus', 'darueber hinaus', 'ein weiteres', 'argument', 'zum einen', 'zum anderen', 'laut', 'demnach', 'begrundet', 'begruendet'] },
      { en: 'one sentence with your view', de: 'ein Satz mit deiner Meinung', any: ['ich halte', 'meiner meinung', 'ich finde', 'ich denke', 'uberzeugt', 'ueberzeugt', 'ich stimme', 'abschliessend', 'insgesamt', 'mein fazit', 'fazit', 'finde ich'] },
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
    id: 'c1-graph-commuting',
    level: 'C1',
    register: 'formal',
    words: [200, 260],
    title: 'A report on commuting figures',
    titleDe: 'Ein Bericht zu Pendlerzahlen',
    prompt: 'Your head of department, Frau Dr. Neumann, has asked you to summarise a survey for the city\'s mobility report. The figures: in 2015, 61 % of commuters drove to work by car, 22 % used public transport and 9 % cycled; in 2025 the shares were 48 %, 29 % and 17 %; the average commute grew from 16 to 19 km. Write her a formal e-mail (about 230 words): describe the main developments, compare the figures, give possible reasons, and recommend one measure for the city.',
    promptDe: 'Deine Abteilungsleiterin, Frau Dr. Neumann, hat dich gebeten, eine Umfrage für den Mobilitätsbericht der Stadt zusammenzufassen. Die Zahlen: 2015 fuhren 61 % der Pendler mit dem Auto zur Arbeit, 22 % nutzten den öffentlichen Nahverkehr und 9 % das Fahrrad; 2025 lagen die Anteile bei 48 %, 29 % und 17 %; der durchschnittliche Arbeitsweg wuchs von 16 auf 19 km. Schreib ihr eine formelle E-Mail (ca. 230 Wörter): Beschreib die wichtigsten Entwicklungen, vergleiche die Zahlen, nenne mögliche Gründe und empfiehl der Stadt eine Maßnahme.',
    points: [
      { en: 'the main developments described', de: 'die wichtigsten Entwicklungen beschrieben', any: ['gesunken', 'gestiegen', 'zuruckgegangen', 'zurueckgegangen', 'zugenommen', 'abgenommen', 'ruckgang', 'rueckgang', 'anstieg', 'entwicklung', 'verandert', 'veraendert', 'von 61', '61 %', '61%', '48 %', '48%', 'prozent'] },
      { en: 'the figures compared', de: 'die Zahlen verglichen', any: ['im vergleich', 'verglichen', 'wahrend', 'waehrend', 'dagegen', 'hingegen', 'demgegenuber', 'demgegenueber', 'verdoppelt', 'prozentpunkte', 'mehr als', 'weniger als', 'doppelt so', 'nur noch', 'inzwischen'] },
      { en: 'possible reasons', de: 'mögliche Gründe', any: ['grund', 'grunde', 'gruende', 'ursache', 'liegt daran', 'zuruckzufuhren', 'zurueckzufuehren', 'erklaren', 'erklaeren', 'vermutlich', 'wahrscheinlich', 'moglicherweise', 'moeglicherweise', 'durfte', 'duerfte', 'radweg', 'benzinpreis', 'spritpreis', 'homeoffice', 'deutschlandticket', 'stau', 'parkplatz', 'umwelt'] },
      { en: 'one measure recommended', de: 'eine Maßnahme empfohlen', any: ['empfehle', 'empfehlung', 'schlage ich vor', 'vorschlag', 'massnahme', 'sollte die stadt', 'rate ich', 'ausbau', 'ausbauen', 'investieren', 'fordern', 'foerdern', 'takt', 'radwege', 'park-and-ride', 'park and ride', 'parkgebuhren', 'parkgebuehren'] },
    ],
  },
  {
    id: 'c1-rent-increase-objection',
    level: 'C1',
    register: 'formal',
    words: [180, 250],
    title: 'An objection to a rent increase',
    titleDe: 'Widerspruch gegen eine Mieterhöhung',
    prompt: 'Your landlord has announced a rent increase of 15 % with reference to the local comparative rent. Write a formal objection (about 220 words): set out the facts (the current rent, the increase announced, the date), give at least two legal and factual grounds for your objection (for example the cap, the condition of the flat, missing evidence), and say what you would agree to and by when you expect an answer.',
    promptDe: 'Dein Vermieter hat eine Mieterhöhung um 15 % mit Verweis auf die ortsübliche Vergleichsmiete angekündigt. Schreib einen formellen Widerspruch (ca. 220 Wörter): Stell den Sachverhalt dar (aktuelle Miete, angekündigte Erhöhung, Datum), nenn mindestens zwei rechtliche und sachliche Gründe für deinen Widerspruch (zum Beispiel Kappungsgrenze, Zustand der Wohnung, fehlende Belege), und sag, womit du einverstanden wärst und bis wann du eine Antwort erwartest.',
    points: [
      { en: 'the facts set out', de: 'der Sachverhalt dargestellt', any: ['sachverhalt', 'derzeit', 'aktuell', 'miete', 'euro', 'erhohung', 'erhoehung', '15', 'prozent', 'schreiben vom', 'angekundigt', 'angekuendigt', 'zum ', 'mieterhohung', 'mieterhoehung'] },
      { en: 'two grounds for the objection', de: 'zwei Gründe für den Widerspruch', any: ['widerspreche', 'widerspruch', 'kappungsgrenze', 'vergleichsmiete', 'mietspiegel', 'begrundung', 'begruendung', 'belege', 'nachweis', 'zustand', 'mangel', 'maengel', 'gemass', 'gemaess', 'paragraf', '§', 'bgb', 'unzulassig', 'unzulaessig', 'nicht nachvollziehbar', 'erstens', 'zweitens', 'zum einen', 'zum anderen'] },
      { en: 'what you would agree to, and the deadline', de: 'womit du einverstanden wärst, und die Frist', any: ['einverstanden', 'bereit', 'akzeptiere', 'zustimmen', 'bis zum', 'frist', 'spatestens', 'spaetestens', 'erwarte', 'antwort', 'stellungnahme', 'ruckmeldung', 'rueckmeldung', 'innerhalb', 'wochen'] },
    ],
  },
  {
    id: 'c1-wind-farm-statement',
    level: 'C1',
    register: 'formal',
    words: [200, 270],
    title: 'A statement on a wind farm',
    titleDe: 'Eine Stellungnahme zu einem Windpark',
    prompt: 'Your municipality is consulting residents on a planned wind farm. Write a statement to the council (about 240 words): weigh up the main arguments for and against (energy supply, landscape and nature, noise, revenue for the village), structure your text clearly with connectors, and come to a reasoned conclusion with one condition or proposal.',
    promptDe: 'Deine Gemeinde befragt die Bürgerinnen und Bürger zu einem geplanten Windpark. Schreib eine Stellungnahme an den Gemeinderat (ca. 240 Wörter): Wäg die wichtigsten Argumente dafür und dagegen ab (Energieversorgung, Landschaft und Natur, Lärm, Einnahmen für den Ort), gliedere deinen Text klar mit Konnektoren, und komm zu einem begründeten Schluss mit einer Bedingung oder einem Vorschlag.',
    points: [
      { en: 'arguments on both sides weighed', de: 'Argumente beider Seiten abgewogen', any: ['einerseits', 'andererseits', 'zwar', 'jedoch', 'allerdings', 'dafur spricht', 'dafuer spricht', 'dagegen spricht', 'vorteil', 'nachteil', 'energie', 'strom', 'landschaft', 'natur', 'vogel', 'voegel', 'larm', 'laerm', 'einnahmen', 'gemeinde', 'klimaschutz', 'abwagen', 'abwaegen'] },
      { en: 'a clear structure with connectors', de: 'eine klare Gliederung mit Konnektoren', any: ['zunachst', 'zunaechst', 'daruber hinaus', 'darueber hinaus', 'ausserdem', 'hinzu kommt', 'demgegenuber', 'demgegenueber', 'folglich', 'somit', 'insofern', 'schliesslich', 'abschliessend', 'zusammenfassend', 'insgesamt', 'erstens', 'zweitens', 'des weiteren', 'nichtsdestotrotz'] },
      { en: 'a reasoned conclusion with a condition', de: 'ein begründeter Schluss mit Bedingung', any: ['komme ich zu', 'fazit', 'spreche mich', 'befurworte', 'befuerworte', 'lehne', 'unter der bedingung', 'vorausgesetzt', 'sofern', 'wenn', 'schlage vor', 'vorschlag', 'abstand', 'beteiligung', 'burgerbeteiligung', 'buergerbeteiligung', 'mindestabstand'] },
    ],
  },
  {
    id: 'c1-letter-about-novel',
    level: 'C1',
    register: 'informal',
    words: [180, 250],
    title: 'A letter about a novel',
    titleDe: 'Ein Brief über einen Roman',
    prompt: 'Your friend Jana has given you a novel and wants to know what you think. Write her a letter (about 220 words): describe how the story unfolds and what the book does with language, style and atmosphere, say what impressed or irritated you and why, and tell her whether and to whom you would recommend it.',
    promptDe: 'Deine Freundin Jana hat dir einen Roman geschenkt und will wissen, was du davon hältst. Schreib ihr einen Brief (ca. 220 Wörter): Beschreib, wie sich die Geschichte entwickelt und was das Buch mit Sprache, Stil und Atmosphäre macht, sag, was dich beeindruckt oder gestört hat und warum, und sag ihr, ob und wem du es empfehlen würdest.',
    points: [
      { en: 'how the story unfolds and its style', de: 'wie sich die Geschichte entwickelt und ihr Stil', any: ['handlung', 'geschichte', 'erzahlt', 'erzaehlt', 'figur', 'hauptfigur', 'protagonist', 'sprache', 'stil', 'ton', 'atmosphare', 'atmosphaere', 'stimmung', 'bilder', 'satze', 'saetze', 'perspektive', 'kapitel', 'beginnend', 'zunachst', 'zunaechst'] },
      { en: 'what impressed or irritated you, and why', de: 'was dich beeindruckt oder gestört hat, und warum', any: ['beeindruckt', 'gestort', 'gestoert', 'irritiert', 'fasziniert', 'beruhrt', 'beruehrt', 'gefallen', 'enttauscht', 'enttaeuscht', 'weil', 'da ', 'denn', 'gerade', 'besonders', 'schwach', 'stark', 'gelungen'] },
      { en: 'whether and to whom you recommend it', de: 'ob und wem du es empfiehlst', any: ['empfehle', 'empfehlen', 'empfehlung', 'wurde ich', 'wuerde ich', 'lesenswert', 'fur alle', 'fuer alle', 'wer ', 'nichts fur', 'nichts fuer', 'unbedingt', 'geeignet', 'eher fur', 'eher fuer'] },
    ],
  },
  {
    id: 'c1-report-ai-at-work',
    level: 'C1',
    register: 'formal',
    words: [200, 270],
    title: 'A report on artificial intelligence at work',
    titleDe: 'Ein Bericht über künstliche Intelligenz am Arbeitsplatz',
    prompt: 'Your head of department, Frau Sommer, has asked you to summarise a panel discussion on artificial intelligence at work for the staff. Write her a formal email (about 240 words): report what the experts said (in indirect speech), explain the connections between the main points clearly, and formulate two recommendations for the department.',
    promptDe: 'Deine Abteilungsleiterin, Frau Sommer, hat dich gebeten, eine Podiumsdiskussion über künstliche Intelligenz am Arbeitsplatz für die Belegschaft zusammenzufassen. Schreib ihr eine formelle E-Mail (ca. 240 Wörter): Gib wieder, was die Expertinnen und Experten gesagt haben (in indirekter Rede), erklär die Zusammenhänge zwischen den wichtigsten Punkten klar, und formulier zwei Empfehlungen für die Abteilung.',
    points: [
      { en: 'what the experts said, in indirect speech', de: 'was die Experten sagten, in indirekter Rede', any: ['sagte', 'erklarte', 'erklaerte', 'betonte', 'wies darauf hin', 'zufolge', 'laut', 'sei', 'habe', 'werde', 'konne', 'koenne', 'musse', 'muesse', 'wolle', 'experte', 'expertin', 'podium', 'diskussion'] },
      { en: 'the connections explained', de: 'die Zusammenhänge erklärt', any: ['zusammenhang', 'daher', 'deshalb', 'folglich', 'somit', 'dadurch', 'infolgedessen', 'das bedeutet', 'das heisst', 'einerseits', 'andererseits', 'wahrend', 'waehrend', 'je ', 'desto', 'umso', 'bedingt', 'fuhrt', 'fuehrt', 'hangt', 'haengt'] },
      { en: 'two recommendations', de: 'zwei Empfehlungen', any: ['empfehle', 'empfehlung', 'empfehlungen', 'schlage vor', 'vorschlag', 'sollte', 'sollten', 'massnahme', 'schulung', 'weiterbildung', 'richtlinie', 'leitlinie', 'pilotprojekt', 'erstens', 'zweitens', 'zum einen', 'zum anderen'] },
    ],
  },
  {
    id: 'c1-proposal-car-free-centre',
    level: 'C1',
    register: 'formal',
    words: [200, 270],
    title: 'A proposal for a car-free centre',
    titleDe: 'Ein Vorschlag für eine autofreie Innenstadt',
    prompt: 'Your city invites proposals for the future of the centre. Write a formal letter to the planning office (about 240 words): present your proposal for a largely car-free centre and the problem it solves, anticipate two objections (for example from shop owners and older residents) and respond to them, and name the first step and who would have to be involved.',
    promptDe: 'Deine Stadt sammelt Vorschläge für die Zukunft der Innenstadt. Schreib einen formellen Brief an das Planungsamt (ca. 240 Wörter): Stell deinen Vorschlag für eine weitgehend autofreie Innenstadt und das Problem vor, das er löst, nimm zwei Einwände vorweg (zum Beispiel von Geschäftsleuten und älteren Menschen) und antworte darauf, und nenn den ersten Schritt und wer beteiligt werden müsste.',
    points: [
      { en: 'the proposal and the problem it solves', de: 'der Vorschlag und das Problem, das er löst', any: ['vorschlag', 'schlage vor', 'autofrei', 'innenstadt', 'zentrum', 'verkehr', 'stau', 'larm', 'laerm', 'abgase', 'luft', 'aufenthaltsqualitat', 'aufenthaltsqualitaet', 'problem', 'losung', 'loesung', 'fussgangerzone', 'fussgaengerzone'] },
      { en: 'two objections anticipated and answered', de: 'zwei Einwände vorweggenommen und beantwortet', any: ['einwand', 'einwande', 'einwaende', 'bedenken', 'befurchten', 'befuerchten', 'geschaftsleute', 'geschaeftsleute', 'handler', 'haendler', 'einzelhandel', 'altere', 'aeltere', 'senioren', 'mobilitat', 'mobilitaet', 'zwar', 'jedoch', 'allerdings', 'dem ist entgegenzuhalten', 'dagegen lasst sich', 'dagegen laesst sich', 'studien zeigen', 'dennoch', 'gleichwohl'] },
      { en: 'the first step and who is involved', de: 'der erste Schritt und wer beteiligt ist', any: ['erster schritt', 'ersten schritt', 'zunachst', 'zunaechst', 'pilot', 'testphase', 'probeweise', 'beteiligt', 'einbeziehen', 'einbinden', 'gemeinsam mit', 'stadtrat', 'anwohner', 'gewerbe', 'verkehrsbetriebe', 'burgerinnen', 'buergerinnen', 'burger', 'buerger'] },
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
  {
    id: 'c2-open-letter-museum',
    level: 'C2',
    register: 'formal',
    words: [240, 320],
    title: 'An open letter to a museum director about the new exhibition',
    titleDe: 'Ein offener Brief an die Museumsdirektorin zur neuen Dauerausstellung',
    prompt: 'The municipal museum has opened a new permanent exhibition on the city\'s history that leaves out its industrial past and relies on screens instead of objects. Write an open letter to the director, Frau Dr. Berger (about 280 words): assess the exhibition\'s concept, criticise two curatorial decisions with reasons, acknowledge what works, and propose concrete changes.',
    promptDe: 'Das Stadtmuseum hat eine neue Dauerausstellung zur Stadtgeschichte eröffnet, die die industrielle Vergangenheit ausspart und statt auf Exponate auf Bildschirme setzt. Schreib einen offenen Brief an die Direktorin, Frau Dr. Berger (ca. 280 Wörter): Beurteile das Konzept der Ausstellung, kritisiere zwei kuratorische Entscheidungen mit Begründung, erkenne an, was gelungen ist, und schlage konkrete Änderungen vor.',
    points: [
      { en: 'the concept assessed', de: 'das Konzept beurteilt', any: ['konzept', 'konzeption', 'ansatz', 'idee', 'anspruch', 'erzahlung', 'erzaehlung', 'narrativ', 'dramaturgie', 'gesamteindruck', 'insgesamt', 'grundsatzlich', 'grundsaetzlich'] },
      { en: 'two decisions criticised with reasons', de: 'zwei Entscheidungen mit Begründung kritisiert', any: ['industrie', 'bildschirm', 'exponat', 'objekt', 'ausgespart', 'fehlt', 'fehlen', 'vermisse', 'bedauerlich', 'problematisch', 'fragwurdig', 'fragwuerdig', 'kritisch', 'kritisiere', 'zum einen', 'zum anderen', 'erstens', 'zweitens'] },
      { en: 'what works, acknowledged', de: 'anerkannt, was gelungen ist', any: ['gelungen', 'uberzeugend', 'ueberzeugend', 'lobenswert', 'positiv', 'anerkenn', 'zugute', 'zu wurdigen', 'zu wuerdigen', 'verdienst', 'gefallt', 'gefaellt', 'beeindruck', 'hervorragend', 'durchaus', 'immerhin', 'zweifellos'] },
      { en: 'concrete changes proposed', de: 'konkrete Änderungen vorgeschlagen', any: ['schlage ich vor', 'vorschlag', 'vorschlagen', 'empfehle', 'anregen', 'anregung', 'erganzen', 'ergaenzen', 'erganzung', 'ergaenzung', 'uberarbeiten', 'ueberarbeiten', 'einbeziehen', 'ausstellen', 'leihgaben', 'ein eigener raum', 'eine eigene abteilung'] },
    ],
  },
  {
    id: 'c2-email-journalist-research',
    level: 'C2',
    register: 'formal',
    words: [220, 300],
    title: 'Explaining your research to a journalist',
    titleDe: 'Die eigene Forschung einer Journalistin erklären',
    prompt: 'A journalist, Frau Dr. Winter, has asked you by email to explain the findings of your research project on a medical or bioethical question for a general audience. Write her a reply (about 260 words): explain the question and the key finding in plain but precise terms, draw a careful distinction between what the study shows and what it merely suggests, and respond to one critical question she has raised.',
    promptDe: 'Eine Journalistin, Frau Dr. Winter, hat dich per E-Mail gebeten, die Ergebnisse deines Forschungsprojekts zu einer medizinischen oder bioethischen Frage für ein breites Publikum zu erklären. Schreib ihr eine Antwort (ca. 260 Wörter): Erklär die Fragestellung und das zentrale Ergebnis verständlich, aber präzise, unterscheide sorgfältig zwischen dem, was die Studie zeigt, und dem, was sie lediglich nahelegt, und geh auf eine kritische Frage ein, die sie gestellt hat.',
    points: [
      { en: 'the question and the key finding, plainly', de: 'die Fragestellung und das zentrale Ergebnis, verständlich', any: ['fragestellung', 'untersucht', 'untersuchung', 'studie', 'ergebnis', 'befund', 'zeigt', 'herausgefunden', 'festgestellt', 'vereinfacht gesagt', 'anders gesagt', 'das heisst', 'mit anderen worten', 'konkret', 'beispiel', 'patienten', 'probanden', 'daten'] },
      { en: 'shown versus merely suggested', de: 'gezeigt versus lediglich nahegelegt', any: ['belegt', 'beweist', 'nachgewiesen', 'nahelegt', 'nahe legt', 'deutet darauf hin', 'vermuten', 'hinweis', 'korrelation', 'kausal', 'ursache', 'zusammenhang', 'nicht gleichbedeutend', 'scheinbar', 'anscheinend', 'offenbar', 'vorbehalt', 'einschrankung', 'einschraenkung', 'weitere studien', 'stichprobe'] },
      { en: 'a critical question answered', de: 'eine kritische Frage beantwortet', any: ['ihre frage', 'sie fragen', 'einwand', 'kritik', 'zu recht', 'berechtigt', 'zugegeben', 'in der tat', 'allerdings', 'jedoch', 'dem ist entgegenzuhalten', 'dennoch', 'gleichwohl', 'interessenkonflikt', 'finanziert', 'unabhangig', 'unabhaengig', 'methodik'] },
    ],
  },
  {
    id: 'c2-tax-office-objection',
    level: 'C2',
    register: 'formal',
    words: [220, 300],
    title: 'An objection to the tax office',
    titleDe: 'Ein Einspruch beim Finanzamt',
    prompt: 'Your tax assessment does not recognise your home-office costs and arrived with a late-payment surcharge, although you filed on time. Write a formal objection to the tax office (about 260 words): state what you object to with reference to the assessment, set out the facts in administrative German and give reasons for each point, and apply for the assessment to be corrected and the surcharge to be waived, with a request for a suspension of enforcement.',
    promptDe: 'Dein Steuerbescheid erkennt deine Homeoffice-Kosten nicht an und enthält einen Verspätungszuschlag, obwohl du fristgerecht abgegeben hast. Schreib einen formellen Einspruch an das Finanzamt (ca. 260 Wörter): Benenn, wogegen du Einspruch einlegst, mit Bezug auf den Bescheid, stell den Sachverhalt im Verwaltungsdeutsch dar und begründe jeden Punkt, und beantrage die Berichtigung des Bescheids und den Erlass des Zuschlags, verbunden mit einem Antrag auf Aussetzung der Vollziehung.',
    points: [
      { en: 'the objection named with reference to the assessment', de: 'der Einspruch mit Bezug auf den Bescheid benannt', any: ['einspruch', 'lege ich', 'bescheid', 'steuerbescheid', 'vom ', 'steuernummer', 'aktenzeichen', 'gegen den', 'hiermit', 'betreff'] },
      { en: 'the facts with reasons for each point', de: 'der Sachverhalt mit Begründung je Punkt', any: ['sachverhalt', 'begrundung', 'begruendung', 'homeoffice', 'arbeitszimmer', 'pauschale', 'werbungskosten', 'fristgerecht', 'eingereicht', 'ubermittelt', 'uebermittelt', 'nachweislich', 'ausweislich', 'zwecks', 'mangels', 'mittels', 'infolge', 'aufgrund', 'gemass', 'gemaess', 'nach §', '§', 'zum einen', 'zum anderen', 'erstens', 'zweitens', 'beleg', 'anlage'] },
      { en: 'correction, waiver and suspension applied for', de: 'Berichtigung, Erlass und Aussetzung beantragt', any: ['beantrage', 'antrag', 'berichtigung', 'berichtigen', 'andern', 'aendern', 'erlass', 'erlassen', 'aufheben', 'aufhebung', 'aussetzung der vollziehung', 'aussetzung', 'vollziehung', 'verspatungszuschlag', 'verspaetungszuschlag', 'zuschlag'] },
    ],
  },
  {
    id: 'c2-style-guide-email',
    level: 'C2',
    register: 'formal',
    words: [220, 300],
    title: 'An email about register and style',
    titleDe: 'Eine E-Mail zu Register und Stil',
    prompt: 'A new colleague, Herr Novak, has asked you to look over a draft letter of his to a ministry that mixes formal and casual language. Write him a formal but friendly email (about 260 words): explain what register the occasion calls for and why, point out two or three clashes of style in his draft with better alternatives, and give him a rule of thumb for choosing the right register in future.',
    promptDe: 'Ein neuer Kollege, Herr Novak, hat dich gebeten, den Entwurf eines Briefs an ein Ministerium durchzusehen, in dem sich förmliche und saloppe Sprache mischen. Schreib ihm eine formelle, aber freundliche E-Mail (ca. 260 Wörter): Erklär, welches Register der Anlass verlangt und warum, zeig zwei oder drei Stilbrüche in seinem Entwurf mit besseren Alternativen auf, und gib ihm eine Faustregel, wie er künftig das passende Register wählt.',
    points: [
      { en: 'the register the occasion calls for, and why', de: 'das Register, das der Anlass verlangt, und warum', any: ['register', 'stilebene', 'formell', 'formlich', 'foermlich', 'sachlich', 'amtlich', 'behordlich', 'behoerdlich', 'ministerium', 'adressat', 'anlass', 'angemessen', 'weil', 'da ', 'denn', 'erwartet', 'ublich', 'ueblich'] },
      { en: 'two or three clashes with alternatives', de: 'zwei oder drei Stilbrüche mit Alternativen', any: ['stilbruch', 'stilbruche', 'stilbrueche', 'salopp', 'umgangssprachlich', 'zu locker', 'statt', 'anstelle', 'besser', 'stattdessen', 'ersetzen', 'formulierung', 'wendung', 'ausdruck', 'zum beispiel', 'etwa', 'beispielsweise', 'zum einen', 'zum anderen', 'erstens', 'zweitens', 'drittens'] },
      { en: 'a rule of thumb for the future', de: 'eine Faustregel für die Zukunft', any: ['faustregel', 'regel', 'merken', 'grundsatz', 'grundsatzlich', 'grundsaetzlich', 'kunftig', 'kuenftig', 'in zukunft', 'immer', 'fragen sie sich', 'stellen sie sich', 'orientieren', 'im zweifel', 'lieber', 'eine stufe', 'tipp'] },
    ],
  },
  {
    id: 'c2-family-chronicle-letter',
    level: 'C2',
    register: 'informal',
    words: [220, 300],
    title: 'A letter for the family chronicle',
    titleDe: 'Ein Brief für die Familienchronik',
    prompt: 'Your cousin Lena is collecting letters for a family chronicle and has asked you for the story of one day that changed something in your family. Write her a letter (about 260 words): narrate the day in the narrative past, including what someone thought or felt in free indirect speech, show how the day connects to what happened before and after, and reflect on what this memory means today.',
    promptDe: 'Deine Cousine Lena sammelt Briefe für eine Familienchronik und hat dich um die Geschichte eines Tages gebeten, der in eurer Familie etwas verändert hat. Schreib ihr einen Brief (ca. 260 Wörter): Erzähl den Tag im Erzähltempus, auch mit dem, was jemand dachte oder fühlte, in erlebter Rede, zeig, wie der Tag mit dem Davor und dem Danach zusammenhängt, und überleg, was diese Erinnerung heute bedeutet.',
    points: [
      { en: 'the day narrated, with thoughts in free indirect speech', de: 'der Tag erzählt, mit Gedanken in erlebter Rede', any: ['damals', 'an diesem tag', 'an jenem tag', 'es war', 'sie war', 'er war', 'ging', 'kam', 'sass', 'stand', 'sagte', 'dachte', 'fuhlte', 'fuehlte', 'wusste', 'was sollte', 'was wurde', 'was wuerde', 'ob ', 'wie lange noch', 'warum nur', 'ahnte'] },
      { en: 'before and after connected', de: 'das Davor und das Danach verbunden', any: ['davor', 'vorher', 'zuvor', 'nachdem', 'bevor', 'seitdem', 'seither', 'danach', 'spater', 'spaeter', 'von da an', 'bis dahin', 'hatte', 'hatten', 'war gewesen', 'jahre spater', 'jahre spaeter', 'sollte', 'veranderte', 'veraenderte'] },
      { en: 'what the memory means today', de: 'was die Erinnerung heute bedeutet', any: ['heute', 'bis heute', 'ruckblickend', 'rueckblickend', 'im ruckblick', 'im rueckblick', 'erinnerung', 'erinnere', 'bedeutet', 'verstehe ich', 'begreife', 'geblieben', 'gepragt', 'gepraegt', 'lehrt', 'gelernt', 'wenn ich daran denke'] },
    ],
  },
  {
    id: 'c2-briefing-ethics-council',
    level: 'C2',
    register: 'formal',
    words: [240, 320],
    title: 'A briefing for an ethics council',
    titleDe: 'Ein Briefing für einen Ethikrat',
    prompt: 'The chair of a municipal ethics council, Herr Prof. Adler, has asked you for a short briefing on whether the city should use facial recognition in public places. Write him a formal email (about 280 words): present the positions of at least three sources (for example the police, a civil-rights group, a legal opinion) in a balanced way, weigh them against each other with precision and tact, and recommend a course of action with conditions.',
    promptDe: 'Der Vorsitzende eines kommunalen Ethikrats, Herr Prof. Adler, hat dich um ein kurzes Briefing dazu gebeten, ob die Stadt Gesichtserkennung im öffentlichen Raum einsetzen soll. Schreib ihm eine formelle E-Mail (ca. 280 Wörter): Stell die Positionen von mindestens drei Quellen (zum Beispiel Polizei, Bürgerrechtsgruppe, Rechtsgutachten) ausgewogen dar, wäg sie präzise und taktvoll gegeneinander ab, und empfiehl ein Vorgehen mit Bedingungen.',
    points: [
      { en: 'three positions presented in a balanced way', de: 'drei Positionen ausgewogen dargestellt', any: ['polizei', 'burgerrecht', 'buergerrecht', 'gutachten', 'datenschutz', 'datenschutzbeauftragte', 'position', 'standpunkt', 'argumentiert', 'fuhrt an', 'fuehrt an', 'verweist', 'betont', 'zufolge', 'laut', 'aus sicht', 'einerseits', 'andererseits', 'wahrend', 'waehrend', 'hingegen', 'demgegenuber', 'demgegenueber', 'quelle', 'quellen'] },
      { en: 'the positions weighed with tact', de: 'die Positionen taktvoll abgewogen', any: ['abwagen', 'abwaegen', 'abwagung', 'abwaegung', 'gewichten', 'uberwiegt', 'ueberwiegt', 'schwerer wiegt', 'verhaltnismassig', 'verhaeltnismaessig', 'verhaltnismassigkeit', 'verhaeltnismaessigkeit', 'zu bedenken', 'nicht von der hand zu weisen', 'berechtigt', 'nachvollziehbar', 'gleichwohl', 'dennoch', 'allerdings', 'freilich', 'zwar', 'jedoch'] },
      { en: 'a recommendation with conditions', de: 'eine Empfehlung mit Bedingungen', any: ['empfehle', 'empfehlung', 'rate', 'vorgehen', 'unter der bedingung', 'unter den bedingungen', 'vorausgesetzt', 'sofern', 'nur dann', 'befristet', 'pilot', 'evaluation', 'evaluiert', 'unabhangige', 'unabhaengige', 'aufsicht', 'kontrolle', 'transparenz', 'verzicht', 'moratorium', 'abzusehen', 'bedingungen'] },
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
