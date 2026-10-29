// Wer bin ich? - one player is secretly a person, an animal, a thing or a place; the other asks yes/no questions
// in German ("Bist du ein Tier?", "Kann man dich essen?") and the holder answers only ja, nein or jein. Twenty
// questions, then a guess. The cards ship with three hints the holder may read out when the guesser is stuck
// (each costs a point), so the game teaches the question forms and the describing words of the level. Pure data
// and scoring here; src/app/together/whoami.tsx runs the round.

import type { Rng } from './drills';
import { LEVELS, levelIndex, type Level } from './levels';

export type WhoAmIKind = 'person' | 'animal' | 'thing' | 'place' | 'food' | 'job';

export interface WhoAmICard {
  /** The secret, with its article where it has one. */
  answer: string;
  /** Other forms that count as right (the feminine job title, a short name), shown to the holder. */
  alts: string[];
  kind: WhoAmIKind;
  level: Level;
  /** Three hints from vague to telling, German, read out by the holder when asked (each costs a point). */
  hints: [string, string, string];
}

export const WHOAMI_QUESTIONS = 20;
export const WHOAMI_HINT_COST = 1;
/** Points for a right guess: the questions left plus a base, minus the hints taken. */
export const WHOAMI_BASE = 5;

type Row = [kind: WhoAmIKind, level: Level, answer: string, alts: string, h1: string, h2: string, h3: string];

const ROWS: Row[] = [
  // A1: concrete, everyday
  ['animal', 'A1', 'der Hund', 'Hund', 'Ich bin ein Tier.', 'Ich wohne bei Menschen.', 'Ich belle.'],
  ['animal', 'A1', 'die Katze', 'Katze', 'Ich bin ein Tier und habe vier Beine.', 'Ich schlafe viel.', 'Ich sage miau.'],
  ['thing', 'A1', 'das Auto', 'Auto', 'Ich bin kein Tier.', 'Ich habe vier Räder.', 'Man fährt mit mir auf der Straße.'],
  ['thing', 'A1', 'das Handy', 'Handy', 'Ich bin klein.', 'Fast jeder hat mich in der Tasche.', 'Man telefoniert mit mir.'],
  ['food', 'A1', 'der Apfel', 'Apfel', 'Man kann mich essen.', 'Ich bin rot oder grün.', 'Ich wachse auf einem Baum.'],
  ['food', 'A1', 'das Brot', 'Brot', 'Man kann mich essen.', 'Ich komme vom Bäcker.', 'Man isst mich mit Butter.'],
  ['place', 'A1', 'die Schule', 'Schule', 'Ich bin ein Gebäude.', 'Kinder gehen jeden Tag zu mir.', 'Hier lernt man lesen und schreiben.'],
  ['place', 'A1', 'der Bahnhof', 'Bahnhof', 'Ich bin ein Ort in der Stadt.', 'Hier warten viele Menschen.', 'Züge kommen und fahren hier.'],
  ['job', 'A1', 'der Arzt', 'Arzt|Ärztin|die Ärztin', 'Ich bin ein Beruf.', 'Ich trage oft Weiß.', 'Ich helfe kranken Menschen.'],
  ['job', 'A1', 'der Lehrer', 'Lehrer|Lehrerin|die Lehrerin', 'Ich bin ein Beruf.', 'Ich arbeite in der Schule.', 'Ich erkläre und gebe Hausaufgaben.'],
  ['thing', 'A1', 'der Schlüssel', 'Schlüssel', 'Ich bin klein und aus Metall.', 'Man verliert mich oft.', 'Ich öffne Türen.'],
  ['thing', 'A1', 'das Bett', 'Bett', 'Ich bin ein Möbelstück.', 'Ich stehe im Schlafzimmer.', 'Man schläft in mir.'],
  // A2
  ['animal', 'A2', 'der Elefant', 'Elefant', 'Ich bin ein Tier.', 'Ich bin sehr groß und grau.', 'Ich habe einen langen Rüssel.'],
  ['animal', 'A2', 'die Biene', 'Biene', 'Ich bin ein kleines Tier und kann fliegen.', 'Ich arbeite viel.', 'Ich mache Honig.'],
  ['thing', 'A2', 'der Regenschirm', 'Regenschirm|Schirm', 'Man nimmt mich mit, wenn das Wetter schlecht ist.', 'Man kann mich aufspannen.', 'Ich schütze vor Regen.'],
  ['thing', 'A2', 'die Brille', 'Brille', 'Ich bin aus Glas und Metall oder Plastik.', 'Man trägt mich im Gesicht.', 'Mit mir sieht man besser.'],
  ['food', 'A2', 'die Kartoffel', 'Kartoffel', 'Man kann mich essen.', 'Ich wachse unter der Erde.', 'Aus mir macht man Pommes.'],
  ['food', 'A2', 'der Käse', 'Käse', 'Man kann mich essen.', 'Ich werde aus Milch gemacht.', 'Mäuse mögen mich angeblich.'],
  ['place', 'A2', 'die Apotheke', 'Apotheke', 'Ich bin ein Geschäft.', 'Man geht zu mir, wenn man krank ist.', 'Hier bekommt man Medikamente.'],
  ['place', 'A2', 'der Flughafen', 'Flughafen', 'Ich bin ein großer Ort.', 'Hier gibt es viele Koffer.', 'Flugzeuge starten und landen hier.'],
  ['job', 'A2', 'der Koch', 'Koch|Köchin|die Köchin', 'Ich bin ein Beruf.', 'Ich arbeite in einer Küche.', 'Ich bereite Essen für Gäste zu.'],
  ['job', 'A2', 'der Polizist', 'Polizist|Polizistin|die Polizistin', 'Ich bin ein Beruf und trage eine Uniform.', 'Ich fahre oft Auto mit Blaulicht.', 'Ich sorge für Sicherheit.'],
  ['person', 'A2', 'der Weihnachtsmann', 'Weihnachtsmann|Nikolaus', 'Ich bin eine Figur, die jedes Kind kennt.', 'Ich habe einen weißen Bart und rote Kleidung.', 'Ich bringe im Dezember Geschenke.'],
  ['thing', 'A2', 'der Kühlschrank', 'Kühlschrank', 'Ich stehe in der Küche.', 'Ich bin innen kalt.', 'Man bewahrt Lebensmittel in mir auf.'],
  // B1
  ['animal', 'B1', 'der Pinguin', 'Pinguin', 'Ich bin ein Vogel, aber ich kann nicht fliegen.', 'Ich lebe, wo es sehr kalt ist.', 'Ich bin schwarz-weiß und schwimme sehr gut.'],
  ['thing', 'B1', 'der Reisepass', 'Reisepass|Pass', 'Ich bin ein kleines Heft.', 'Ohne mich kommt man nicht in viele Länder.', 'Mein Foto ist meistens unvorteilhaft.'],
  ['thing', 'B1', 'die Waschmaschine', 'Waschmaschine', 'Ich bin ein Gerät im Haushalt.', 'Ich drehe mich und brauche Wasser.', 'Ich mache Kleidung sauber.'],
  ['place', 'B1', 'das Rathaus', 'Rathaus', 'Ich bin ein wichtiges Gebäude in jeder Stadt.', 'Hier arbeitet der Bürgermeister.', 'Hier kann man heiraten.'],
  ['place', 'B1', 'die Baustelle', 'Baustelle', 'Ich bin laut und staubig.', 'Hier tragen alle Helme.', 'Hier entsteht ein neues Haus.'],
  ['job', 'B1', 'der Friseur', 'Friseur|Friseurin|die Friseurin', 'Ich bin ein Beruf.', 'Bei mir muss man ruhig sitzen.', 'Ich arbeite mit Schere und Kamm.'],
  ['job', 'B1', 'die Krankenschwester', 'Krankenschwester|Pfleger|Krankenpfleger|der Krankenpfleger', 'Ich arbeite im Schichtdienst.', 'Ich messe Fieber und gebe Medikamente.', 'Ich arbeite im Krankenhaus, bin aber kein Arzt.'],
  ['person', 'B1', 'Albert Einstein', 'Einstein', 'Ich bin ein berühmter Mensch, ich lebe nicht mehr.', 'Ich war Physiker und hatte wilde Haare.', 'Meine berühmteste Formel hat drei Buchstaben.'],
  ['food', 'B1', 'die Brezel', 'Brezel|Breze|Brezn', 'Man kann mich essen.', 'Ich bin braun, salzig und habe eine besondere Form.', 'Man isst mich oft mit Weißwurst oder zum Bier.'],
  ['thing', 'B1', 'der Führerschein', 'Führerschein', 'Ich bin eine kleine Karte.', 'Man muss eine Prüfung bestehen, um mich zu bekommen.', 'Ohne mich darf man nicht Auto fahren.'],
  ['person', 'B1', 'die Brüder Grimm', 'Grimm|Gebrüder Grimm', 'Wir sind zwei Männer aus dem 19. Jahrhundert.', 'Wir haben Geschichten gesammelt.', 'Rotkäppchen und Hänsel und Gretel kennt man durch uns.'],
  ['animal', 'B1', 'die Schnecke', 'Schnecke', 'Ich bin ein kleines Tier im Garten.', 'Ich bin sehr langsam.', 'Ich trage mein Haus auf dem Rücken.'],
  // B2
  ['thing', 'B2', 'der Impfpass', 'Impfpass|Impfausweis', 'Ich bin ein gelbes Dokument.', 'Ärzte schreiben in mich hinein.', 'In mir steht, wogegen man geschützt ist.'],
  ['thing', 'B2', 'die Steuererklärung', 'Steuererklärung', 'Niemand macht mich gern.', 'Man macht mich einmal im Jahr.', 'Manchmal bekommt man dank mir Geld zurück.'],
  ['place', 'B2', 'das Standesamt', 'Standesamt', 'Ich bin eine Behörde.', 'Hier werden Geburten und Todesfälle eingetragen.', 'Hier sagt man Ja.'],
  ['place', 'B2', 'die Autobahn', 'Autobahn', 'Ich bin in Deutschland weltberühmt.', 'Auf mir gibt es oft Stau.', 'Auf manchen Abschnitten gibt es kein Tempolimit.'],
  ['job', 'B2', 'der Schornsteinfeger', 'Schornsteinfeger|Kaminkehrer', 'Ich bin ein Beruf und trage Schwarz.', 'Man sagt, ich bringe Glück.', 'Ich klettere auf Dächer und reinige Kamine.'],
  ['job', 'B2', 'der Dolmetscher', 'Dolmetscher|Dolmetscherin|die Dolmetscherin', 'Ich arbeite mit Sprachen.', 'Ich spreche fast gleichzeitig mit jemand anderem.', 'Ohne mich verstehen sich zwei Menschen nicht.'],
  ['person', 'B2', 'Angela Merkel', 'Merkel', 'Ich bin eine bekannte Politikerin.', 'Ich war sechzehn Jahre lang im Amt.', 'Ich war die erste Frau an der Spitze der deutschen Regierung.'],
  ['person', 'B2', 'Ludwig van Beethoven', 'Beethoven', 'Ich bin ein berühmter Komponist.', 'Ich wurde in Bonn geboren und lebte in Wien.', 'Ich wurde taub und komponierte trotzdem weiter.'],
  ['thing', 'B2', 'das Pfand', 'Pfand|Flaschenpfand', 'Ich bin Geld, das man zurückbekommt.', 'Man gibt mich am Automaten im Supermarkt zurück.', 'Ich klebe an Flaschen und Dosen.'],
  ['animal', 'B2', 'der Adler', 'Adler', 'Ich bin ein großer Vogel.', 'Ich sehe sehr gut und fliege hoch.', 'Ich bin das Wappentier Deutschlands.'],
  ['food', 'B2', 'das Sauerkraut', 'Sauerkraut', 'Man kann mich essen.', 'Ich bin sauer und gesund.', 'Ich werde aus Weißkohl gemacht und bin ein Klischee über Deutsche.'],
  ['place', 'B2', 'der Schwarzwald', 'Schwarzwald', 'Ich bin eine Landschaft im Südwesten.', 'Man kennt mich für Kuckucksuhren und eine Torte.', 'Ich bin ein großes Mittelgebirge mit vielen Tannen.'],
  // C1
  ['thing', 'C1', 'das Grundgesetz', 'Grundgesetz', 'Ich bin ein Text.', 'Ich bin seit 1949 in Kraft.', 'Mein erster Artikel handelt von der Würde des Menschen.'],
  ['thing', 'C1', 'der Bundestag', 'Bundestag', 'Ich bin eine Institution.', 'Ich sitze in Berlin in einem Gebäude mit Glaskuppel.', 'Ich beschließe die Gesetze.'],
  ['place', 'C1', 'die Zugspitze', 'Zugspitze', 'Ich bin ein Ort in Bayern.', 'Ich bin fast dreitausend Meter hoch.', 'Ich bin der höchste Punkt Deutschlands.'],
  ['person', 'C1', 'Johann Wolfgang von Goethe', 'Goethe', 'Ich bin ein Schriftsteller und lebe nicht mehr.', 'Ich lebte in Weimar und war auch Minister.', 'Mein berühmtestes Werk handelt von einem Pakt mit dem Teufel.'],
  ['person', 'C1', 'Marie Curie', 'Curie', 'Ich bin eine Wissenschaftlerin.', 'Ich habe zwei Nobelpreise bekommen.', 'Ich habe die Radioaktivität erforscht.'],
  ['job', 'C1', 'der Notar', 'Notar|Notarin|die Notarin', 'Ich bin ein juristischer Beruf.', 'Ohne mich kann man kein Haus kaufen.', 'Ich beglaubige Unterschriften und Verträge.'],
  ['thing', 'C1', 'die Schufa', 'Schufa|SCHUFA', 'Ich bin eine Firma, die jeder in Deutschland kennt.', 'Vermieter wollen eine Auskunft von mir.', 'Ich speichere, wie kreditwürdig jemand ist.'],
  ['thing', 'C1', 'der Soli', 'Soli|Solidaritätszuschlag', 'Ich bin eine Abgabe.', 'Ich wurde nach der Wiedervereinigung eingeführt.', 'Die meisten zahlen mich heute nicht mehr.'],
  ['person', 'C1', 'Immanuel Kant', 'Kant', 'Ich bin ein Philosoph.', 'Ich habe Königsberg nie verlassen.', 'Der kategorische Imperativ stammt von mir.'],
  ['place', 'C1', 'die Berliner Mauer', 'Mauer|Berliner Mauer', 'Ich existiere nicht mehr.', 'Ich teilte eine Stadt achtundzwanzig Jahre lang.', 'Ich fiel im November 1989.'],
  ['thing', 'C1', 'die Energiewende', 'Energiewende', 'Ich bin ein politisches Projekt.', 'Windräder und Solardächer gehören zu mir.', 'Ich bin der Umstieg von Kohle und Atom auf erneuerbare Energien.'],
  // C2
  ['thing', 'C2', 'der Duden', 'Duden', 'Ich bin ein Buch.', 'Man schlägt in mir nach, wenn man streitet.', 'Ich sage, wie man ein Wort schreibt.'],
  ['thing', 'C2', 'die Schuldenbremse', 'Schuldenbremse', 'Ich stehe im Grundgesetz.', 'Politiker streiten ständig über mich.', 'Ich begrenze, wie viel der Staat sich leihen darf.'],
  ['person', 'C2', 'Hannah Arendt', 'Arendt', 'Ich bin eine Denkerin des 20. Jahrhunderts.', 'Ich musste Deutschland verlassen und lebte in New York.', 'Ich prägte den Begriff der Banalität des Bösen.'],
  ['person', 'C2', 'Franz Kafka', 'Kafka', 'Ich bin ein Schriftsteller aus Prag.', 'Ich wollte, dass man meine Texte verbrennt.', 'In meiner bekanntesten Erzählung wacht jemand als Käfer auf.'],
  ['thing', 'C2', 'der Konjunktiv', 'Konjunktiv', 'Ich bin ein grammatisches Phänomen.', 'Ohne mich gäbe es keine Höflichkeit und keine Träume.', 'Man braucht mich für die indirekte Rede.'],
  ['place', 'C2', 'der Reichstag', 'Reichstag|Reichstagsgebäude', 'Ich bin ein Gebäude in Berlin.', 'Ich brannte 1933 und wurde später verhüllt.', 'Heute tagt in mir der Bundestag.'],
  ['person', 'C2', 'Rosa Luxemburg', 'Luxemburg', 'Ich bin eine politische Figur des frühen 20. Jahrhunderts.', 'Ich wurde 1919 in Berlin ermordet.', 'Von mir stammt der Satz über die Freiheit der Andersdenkenden.'],
  ['thing', 'C2', 'das Betriebssystem', 'Betriebssystem', 'Ich bin unsichtbar, aber ohne mich geht nichts.', 'Ich verwalte Speicher und Programme.', 'Windows, Android und Linux gehören zu meiner Art.'],
  ['job', 'C2', 'der Lektor', 'Lektor|Lektorin|die Lektorin', 'Ich arbeite in einem Verlag.', 'Ich lese Manuskripte, bevor sie Bücher werden.', 'Ich streiche, was der Autor zu viel geschrieben hat.'],
  ['thing', 'C2', 'die Gewaltenteilung', 'Gewaltenteilung', 'Ich bin ein Prinzip.', 'Ohne mich hätte eine Person zu viel Macht.', 'Ich trenne Regierung, Parlament und Gerichte.'],
  ['person', 'C2', 'Bertolt Brecht', 'Brecht', 'Ich bin ein Dramatiker des 20. Jahrhunderts.', 'Ich gründete das Berliner Ensemble.', 'Die Dreigroschenoper stammt von mir.'],
];

export const WHOAMI_CARDS: WhoAmICard[] = ROWS.map(([kind, level, answer, alts, h1, h2, h3]) => ({
  answer,
  alts: alts.split('|'),
  kind,
  level,
  hints: [h1, h2, h3],
}));

/** The kind of secret, in German, for the holder's card. */
export const WHOAMI_KIND_DE: Record<WhoAmIKind, string> = {
  person: 'eine Person',
  animal: 'ein Tier',
  thing: 'ein Ding',
  place: 'ein Ort',
  food: 'etwas zu essen',
  job: 'ein Beruf',
};

/** Question frames the guesser can lean on; the ready screen shows a handful so the forms get practised. */
export const WHOAMI_STARTERS: string[] = [
  'Bist du ein Mensch?',
  'Bist du ein Tier?',
  'Bist du ein Ding?',
  'Bist du ein Ort?',
  'Lebst du noch?',
  'Kann man dich essen?',
  'Kann man dich kaufen?',
  'Bist du größer als ein Auto?',
  'Gibt es dich in jedem Haus?',
  'Bist du berühmt?',
  'Kommst du aus Deutschland?',
  'Hast du etwas mit Arbeit zu tun?',
  'Braucht man dich jeden Tag?',
  'Bist du aus Metall?',
  'Kennt dich jedes Kind?',
];

/** Cards at or below the level, shuffled, the level's own first so a round at B1 is a B1 round. */
export function whoAmICards(level: Level, rng: Rng, n = 12): WhoAmICard[] {
  const own = WHOAMI_CARDS.filter((c) => c.level === level);
  const below = WHOAMI_CARDS.filter((c) => levelIndex(c.level) < levelIndex(level));
  return [...rng.shuffle(own), ...rng.shuffle(below)].slice(0, n);
}

/** The answer without its article, for the lexicon. */
export const whoAmILemma = (card: WhoAmICard) => card.answer.replace(/^(der|die|das)\s+/, '');

/** The points for a right guess after `asked` questions and `hints` hints; never below one. */
export function whoAmIScore(asked: number, hints: number): number {
  return Math.max(1, WHOAMI_BASE + (WHOAMI_QUESTIONS - asked) - hints * WHOAMI_HINT_COST);
}

export const whoAmILevels = (): Level[] => LEVELS.filter((l) => WHOAMI_CARDS.some((c) => c.level === l));
