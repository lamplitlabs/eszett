// Listening situations: the short pieces of German people hear in public and on the phone - a platform
// announcement, a supermarket call, a doctor's answering machine, a voicemail from a friend, a radio weather
// report - the way the Goethe, telc and DTZ Hören parts open. The tutor writes one on the phone in the reading
// draft's shape (Titel, text, Frage 1-3 with a), b), c) and Antwort), the app plays it through the phone's voice
// with the sound of the place (src/features/ambience.ts: station, café, street, or a phone line), the text stays
// hidden until the questions are answered, and the questions ask what the exam asks: which platform, what time,
// what you should do.

import type { Level } from './levels';

export type SituationKind = 'announcement' | 'voicemail' | 'radio' | 'dialogue';

export interface Situation {
  key: string;
  kind: SituationKind;
  /** The place the sound comes from, for the ambience bed. */
  place: 'station' | 'cafe' | 'street' | 'phone' | 'room';
  /** The levels it is set at. */
  levels: Level[];
  /** What the tutor is asked to write, in English; the German is the model's. */
  brief_en: string;
  /** The title shown before listening, so the learner knows the situation like an exam candidate does. */
  title_de: string;
  title_en: string;
}

/** Words per piece at a level: announcements are short, a radio piece or a dialogue at B2+ longer. */
export const SITUATION_WORDS: Record<Level, [number, number]> = {
  A1: [25, 45],
  A2: [35, 60],
  B1: [50, 80],
  B2: [70, 110],
  C1: [90, 140],
  C2: [110, 160],
};

export const SITUATIONS: Situation[] = [
  { key: 'train-platform', kind: 'announcement', place: 'station', levels: ['A1', 'A2', 'B1'], brief_en: 'a platform announcement at a German railway station: a train to a named city, its departure time, the platform, a delay of some minutes and, for A2 and above, a change of platform', title_de: 'Am Bahnhof: Durchsage am Gleis', title_en: 'At the station: a platform announcement' },
  { key: 'train-onboard', kind: 'announcement', place: 'station', levels: ['A2', 'B1', 'B2'], brief_en: 'an announcement by the conductor inside a German train: the next stop, the connections there with platforms and times, where the dining car is, and a request (tickets ready, mind the gap)', title_de: 'Im Zug: Durchsage des Zugbegleiters', title_en: 'On the train: the conductor speaks' },
  { key: 'supermarket', kind: 'announcement', place: 'cafe', levels: ['A1', 'A2'], brief_en: 'an announcement in a German supermarket: a special offer with a price and where to find it, the opening hours today, and a call for a customer or a colleague to come somewhere', title_de: 'Im Supermarkt: Durchsage', title_en: 'In the supermarket: an announcement' },
  { key: 'airport-gate', kind: 'announcement', place: 'station', levels: ['A2', 'B1', 'B2'], brief_en: 'a gate announcement at a German airport: a flight number and destination, boarding now or delayed, the gate, which passengers board first, and a passenger called to the information desk', title_de: 'Am Flughafen: Durchsage am Gate', title_en: 'At the airport: a gate announcement' },
  { key: 'doctor-machine', kind: 'voicemail', place: 'phone', levels: ['A1', 'A2', 'B1'], brief_en: 'the answering machine of a German doctor\'s practice: the name of the practice, the opening hours, what to do in an emergency, and how to book an appointment', title_de: 'Anrufbeantworter einer Arztpraxis', title_en: 'A doctor\'s practice answering machine' },
  { key: 'friend-voicemail', kind: 'voicemail', place: 'phone', levels: ['A1', 'A2', 'B1'], brief_en: 'a voicemail from a friend about meeting at the weekend: a suggestion with a day, a time and a place, a reason the first plan changed, and a request to call back', title_de: 'Sprachnachricht von einem Freund', title_en: 'A voicemail from a friend' },
  { key: 'office-voicemail', kind: 'voicemail', place: 'phone', levels: ['B1', 'B2', 'C1', 'C2'], brief_en: 'a voicemail from an office (a landlord, an insurance, the Bürgeramt): who is calling and why, a document that is missing, a deadline, and what the listener should do', title_de: 'Nachricht vom Amt oder vom Vermieter', title_en: 'A message from an office or the landlord' },
  { key: 'radio-weather', kind: 'radio', place: 'room', levels: ['A2', 'B1'], brief_en: 'a short radio weather report for Germany: today and tomorrow, temperatures, rain or sun in two regions, and a warning for drivers or travellers', title_de: 'Im Radio: der Wetterbericht', title_en: 'On the radio: the weather' },
  { key: 'radio-traffic', kind: 'radio', place: 'street', levels: ['B1', 'B2'], brief_en: 'a radio traffic report: a motorway with a jam and its length, a closed road and the diversion, an accident, and a note for public transport', title_de: 'Im Radio: Verkehrsmeldungen', title_en: 'On the radio: traffic news' },
  { key: 'radio-news', kind: 'radio', place: 'room', levels: ['B2', 'C1', 'C2'], brief_en: 'three short radio news items from Germany: a local decision (a city council, a school, a hospital), a figure from the economy or the weather, and a cultural event, in the register of the news', title_de: 'Im Radio: Nachrichten', title_en: 'On the radio: the news' },
  { key: 'street-directions', kind: 'dialogue', place: 'street', levels: ['A1', 'A2'], brief_en: 'a short dialogue in the street: someone asks the way to a place (the station, a pharmacy, a museum), and a passer-by explains the way with two or three turns, a landmark and how long it takes', title_de: 'Auf der Straße: nach dem Weg fragen', title_en: 'In the street: asking the way' },
  { key: 'cafe-order', kind: 'dialogue', place: 'cafe', levels: ['A1', 'A2'], brief_en: 'a short dialogue in a café between a waiter and a guest: ordering a drink and something to eat, a question about what is in it, the price, and paying', title_de: 'Im Café: bestellen und bezahlen', title_en: 'In the café: ordering and paying' },
  { key: 'reception-call', kind: 'dialogue', place: 'phone', levels: ['A2', 'B1', 'B2'], brief_en: 'a phone dialogue with a doctor\'s receptionist: the caller wants an appointment, the receptionist offers two times, asks for the insurance card and the reason, and says what to bring', title_de: 'Am Telefon: einen Termin vereinbaren', title_en: 'On the phone: making an appointment' },
  { key: 'buergeramt-counter', kind: 'dialogue', place: 'room', levels: ['B1', 'B2'], brief_en: 'a dialogue at the counter of a German Bürgeramt: registering an address (Anmeldung), which documents are needed, a form to fill in, a fee, and when the confirmation comes', title_de: 'Im Bürgeramt: die Anmeldung', title_en: 'At the Bürgeramt: registering' },
  { key: 'lecture-excerpt', kind: 'radio', place: 'room', levels: ['C1', 'C2'], brief_en: 'the opening minutes of a university lecture or a podium talk in Germany on a question of society, science or history: the thesis, two arguments with one figure each, a counter-position the speaker takes up, and what the talk will go on to show', title_de: 'Im Hörsaal: Anfang eines Vortrags', title_en: 'In the lecture hall: the start of a talk' },
  { key: 'expert-interview', kind: 'dialogue', place: 'room', levels: ['C1', 'C2'], brief_en: 'a short radio interview with an expert (a doctor, an engineer, a historian) on a current question in Germany: two questions and two answers with one figure, one qualification and one recommendation', title_de: 'Im Radio: ein Interview', title_en: 'On the radio: an interview' },
];

export const situationsFor = (level: Level): Situation[] => SITUATIONS.filter((s) => s.levels.includes(level));
export const situationByKey = (key: string): Situation | undefined => SITUATIONS.find((s) => s.key === key);

/** The spoken register the tutor should write in, per kind. */
export function situationStyle(kind: SituationKind): string {
  switch (kind) {
    case 'announcement':
      return 'Write it as it is spoken over a loudspeaker: one speaker, formal Sie, short sentences, every number said in words (times, platforms, prices, minutes), the place and the key facts repeated once, no title inside the text.';
    case 'voicemail':
      return 'Write it as one person speaking into an answering machine or a voice message: a greeting, who is speaking, the message, what the listener should do, a goodbye; natural spoken German, every number in words.';
    case 'radio':
      return 'Write it as a radio presenter reads it: a short lead-in, the items one after another, figures said in words, the register of German radio.';
    case 'dialogue':
      return 'Write it as a dialogue of two people, each turn on its own line starting with the speaker\'s role and a colon (for example "Kellner:" and "Gast:"), six to ten turns, natural spoken German.';
  }
}
