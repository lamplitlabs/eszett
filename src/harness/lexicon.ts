// The verified lexicon that ships with the model (lexicon.json: 3,835 nouns with gender and plural, 164
// irregular verbs, and compact gender/plural maps over ~88k Wiktionary lemmas). The app uses it twice:
// drills draw their nouns and verbs from it, and every answer the model writes is checked against it,
// a port of the release gate's `check_text` (wrong gender in citation position, wrong plural in a
// vocabulary entry, broken verb paradigms).

import { atOrBelow, cefrOf, type Level } from './levels';
import { t } from '../i18n';

export type Genus = 'm' | 'f' | 'n';
export type Article = 'der' | 'die' | 'das';

export interface LexNoun {
  lemma: string;
  genus: Genus;
  plural: string[];
  meaning?: string;
  example?: string;
  level?: string; // "A1.1" … "C1.4" (no release has a C2 tier yet)
  /** How often the word was seen in the course corpus; only the full lexicon carries it. */
  freq?: number;
}

export interface LexVerb {
  infinitive: string;
  present_3sg: string;
  preterite: string;
  participle: string;
  auxiliary: 'haben' | 'sein';
  meaning: string;
}

/** The parts of lexicon.json the app reads; `check` and `lemma_plurals` come with the full file only. */
export interface LexiconData {
  attribution?: string;
  licence?: string;
  nouns: LexNoun[];
  verbs: LexVerb[];
  check?: Record<string, string>;
  lemma_plurals?: Record<string, string[]>;
}

export const GENUS_ARTICLE: Record<Genus, Article> = { m: 'der', f: 'die', n: 'das' };
const LINKERS = ['s', 'n', 'en', 'es', 'er', 'e', 'ens'];
const LETTER = 'A-Za-zÄÖÜäöüß';
const NOT_LETTER_AHEAD = `(?![${LETTER}])`;

// Verbs whose Perfekt auxiliary depends on meaning, transitivity or region: never judged.
export const AUX_VARIES = new Set([
  'fahren', 'fliegen', 'schwimmen', 'treten', 'reiten', 'laufen', 'rennen', 'springen', 'umziehen', 'ausziehen',
  'einziehen', 'anziehen', 'ziehen', 'stoßen', 'schmelzen', 'fallen', 'gefallen', 'erschrecken', 'hängen',
  'brechen', 'frieren', 'reißen', 'liegen', 'sitzen', 'stehen', 'biegen', 'gebären', 'tanzen',
  'segeln', 'klettern', 'wandern', 'joggen', 'rudern', 'heilen', 'trocknen', 'verderben', 'fließen',
]);
// Intransitive verbs whose Perfekt never takes sein.
const HABEN_ONLY = new Set(['schlafen', 'arbeiten', 'lachen', 'weinen', 'warten', 'wohnen', 'leben', 'heißen', 'wissen']);
const AUX_HABEN = '(?:habe|hast|hat|haben|habt|hatte|hattest|hatten|hattet|hätte|hätten)';
const AUX_HABEN_FINITE = '(?:habe|hast|hat|habt|hatte|hattest|hatten|hattet|hätte|hätten)';
const AUX_SEIN = '(?:bin|bist|ist|sind|seid|war|warst|waren|wart|wäre|wären)';
const CASE_PREPOSITIONS =
  'außerhalb|innerhalb|wegen|trotz|während|statt|anstatt|aufgrund|mithilfe|dank|laut|seitens|infolge|anhand|anlässlich|bezüglich|jenseits|oberhalb|unterhalb|aus|bei|mit|nach|seit|von|zu|gegenüber|in|an|auf|hinter|neben|über|unter|vor|zwischen';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class LexiconIndex {
  readonly nouns: LexNoun[];
  readonly verbs: LexVerb[];
  readonly attribution: string;
  /** True when the gender/plural maps over the whole upstream table are loaded (needed to judge answers). */
  readonly full: boolean;
  private genus = new Map<string, Set<Article>>();
  private pluralsOf = new Map<string, Set<string>>();
  private pluralForms = new Set<string>();
  private known = new Set<string>();
  private nounByLemma = new Map<string, LexNoun>();
  private verbByForm = new Map<string, LexVerb>();
  private verbStems = new Set<string>();
  private verbChecks: { verb: LexVerb; wrongForm: RegExp[]; habenWithSein: RegExp | null; seinWithHaben: RegExp | null }[];

  constructor(data: LexiconData) {
    this.nouns = data.nouns;
    this.verbs = data.verbs;
    this.attribution = data.attribution ?? '';
    this.full = Boolean(data.check);
    for (const [lemma, letters] of Object.entries(data.check ?? {})) {
      const set = new Set<Article>();
      for (const g of letters) if (g in GENUS_ARTICLE) set.add(GENUS_ARTICLE[g as Genus]);
      this.genus.set(lemma, set);
    }
    for (const n of data.nouns) {
      this.nounByLemma.set(n.lemma, n);
      if (!this.genus.has(n.lemma)) this.genus.set(n.lemma, new Set([GENUS_ARTICLE[n.genus]]));
    }
    for (const [lemma, forms] of Object.entries(data.lemma_plurals ?? {})) this.pluralsOf.set(lemma, new Set(forms));
    for (const n of data.nouns) {
      if (!n.plural.length) continue;
      const set = this.pluralsOf.get(n.lemma) ?? new Set<string>();
      n.plural.forEach((p) => set.add(p));
      this.pluralsOf.set(n.lemma, set);
    }
    for (const forms of this.pluralsOf.values()) forms.forEach((f) => this.pluralForms.add(f));
    for (const k of this.genus.keys()) this.known.add(k);
    this.pluralForms.forEach((f) => this.known.add(f));
    for (const v of data.verbs) {
      if (/en$/.test(v.infinitive) && v.infinitive.length > 4) this.verbStems.add(v.infinitive.slice(0, -2));
      for (const form of [v.infinitive, v.present_3sg, v.preterite, v.participle]) {
        if (!this.verbByForm.has(form.toLowerCase())) this.verbByForm.set(form.toLowerCase(), v);
      }
    }
    this.verbChecks = data.verbs.map((verb) => {
      const bad = [verb.present_3sg, verb.preterite].filter((f, i, a) => f && f !== verb.participle && a.indexOf(f) === i);
      const judged = !AUX_VARIES.has(verb.infinitive);
      return {
        verb,
        wrongForm: bad.map((f) => new RegExp(`(?:^|[^${LETTER}])(?:${AUX_HABEN_FINITE}|${AUX_SEIN}) ${escapeRe(f)}${NOT_LETTER_AHEAD}`, 'g')),
        habenWithSein:
          judged && verb.auxiliary === 'sein'
            ? new RegExp(`(?:^|[^${LETTER}])${AUX_HABEN} ${escapeRe(verb.participle)}${NOT_LETTER_AHEAD}`, 'g')
            : null,
        seinWithHaben:
          judged && HABEN_ONLY.has(verb.infinitive)
            ? new RegExp(`(?:^|[^${LETTER}])${AUX_SEIN} ${escapeRe(verb.participle)}${NOT_LETTER_AHEAD}`, 'g')
            : null,
      };
    });
  }

  /** The articles a noun takes ("der Joghurt" and "das Joghurt" both exist); empty when unknown. */
  articlesOf(lemma: string): Article[] {
    return [...(this.genus.get(lemma) ?? [])];
  }

  pluralsOfLemma(lemma: string): string[] {
    return [...(this.pluralsOf.get(lemma) ?? [])];
  }

  noun(lemma: string): LexNoun | undefined {
    return this.nounByLemma.get(lemma);
  }

  /** A verb from the irregular-verb table by any of its forms ("ging", "gegangen", "geht", "gehen"). */
  verb(form: string): LexVerb | undefined {
    return this.verbByForm.get(form.toLowerCase());
  }

  isKnown(word: string): boolean {
    return this.known.has(word);
  }

  isPluralForm(word: string): boolean {
    return this.pluralForms.has(word);
  }

  /** The lemma a plural form belongs to ("Häuser" -> "Haus"), when the drill set has it. */
  lemmaOfPlural(form: string): string | undefined {
    for (const n of this.nouns) if (n.plural.includes(form)) return n.lemma;
    return undefined;
  }

  /** True when the word splits into two known nouns with an optional linking element (Haustür, Arbeitszimmer). */
  isCompound(word: string): boolean {
    for (let i = 3; i < word.length - 2; i += 1) {
      const head = word.slice(0, i);
      const tail = word.slice(i);
      const tailCap = tail[0].toUpperCase() + tail.slice(1);
      if (!this.known.has(tailCap)) continue;
      if (this.genus.has(head)) return true;
      for (const link of LINKERS) if (head.endsWith(link) && this.genus.has(head.slice(0, -link.length))) return true;
    }
    return false;
  }

  /**
   * A compound split into its first part and its last noun (Spiel + Stein, Fahr(en) + Rad, Bahnhof + s + Uhr).
   * Both parts must be known: the first a noun (with an optional linking element) or a verb stem from the verb
   * table, the last a noun of at least three letters. Undefined when the word is not such a compound.
   */
  compoundSplit(word: string): { first: string; last: string } | undefined {
    for (let i = 3; i <= word.length - 3; i += 1) {
      const first = word.slice(0, i);
      const last = word[i].toUpperCase() + word.slice(i + 1);
      if (!this.genus.has(last)) continue;
      const firstKnown =
        this.genus.has(first) ||
        LINKERS.some((l) => first.endsWith(l) && first.length - l.length >= 3 && this.genus.has(first.slice(0, -l.length))) ||
        this.verbStems.has(first.toLowerCase());
      if (firstKnown) return { first, last };
    }
    return undefined;
  }

  /**
   * What a compound the lexicon does not list inherits from its head: the last part after a hyphen
   * ("Vier-Tage-Woche" → Woche) or the last noun of a closed compound ("Debattenkultur" → Kultur). A German
   * compound takes the gender of its head and forms its plural on it, so both are as reliable as the head's
   * own entry. Undefined for a listed word, a word with no known head, or a head with several genera.
   */
  compoundHead(word: string): { head: string; article: Article; plural: string | null } | undefined {
    if (this.genus.has(word)) return undefined;
    const hyphen = word.lastIndexOf('-');
    const split = hyphen >= 0 ? { first: word.slice(0, hyphen + 1), last: word.slice(hyphen + 1) } : this.compoundSplit(word);
    if (!split || !split.last || split.last === word) return undefined;
    const articles = this.articlesOf(split.last);
    if (articles.length !== 1) return undefined;
    const headPlural = this.pluralsOfLemma(split.last)[0];
    const plural = headPlural ? split.first + (hyphen >= 0 ? headPlural : headPlural.toLowerCase()) : null;
    return { head: split.last, article: articles[0], plural };
  }

  /** Verb-paradigm checks, exposed for checkText. */
  get paradigmChecks() {
    return this.verbChecks;
  }
}

// ------------------------------------------------------------------------------------------------
// checking an answer
// ------------------------------------------------------------------------------------------------

export interface LexFinding {
  kind: 'gender' | 'plural' | 'verb' | 'agreement';
  /** What the text says, e.g. "die Fahrrad", "der Kurs -> Kurse", "hat gegangen", "eine kleine Geschenk". */
  claimed: string;
  /** What the lexicon says, e.g. "das Fahrrad". */
  expected: string;
  /** A one-line, learner-facing explanation. */
  note: string;
  index: number;
}

export interface LexCitation {
  article: Article;
  noun: string;
  index: number;
}

export interface LexReport {
  findings: LexFinding[];
  /** Article + noun pairs in citation position that the lexicon confirms. */
  verified: LexCitation[];
  unknown: string[];
}

const CITE = new RegExp(`(der|die|das) ([A-ZÄÖÜ][a-zäöüß]{2,})(?![a-zäöüß]|-[A-ZÄÖÜ])`, 'g');
const CITE_BEFORE = new Set(['\n', '-', '*', '•', '|', '(', ':', ';', ',', '/', '–', '—', '„', '"', "'", '‚', '>', '“', '‘']);
const QUOTE_BEFORE = new Set(['„', '"', "'", '‚', '‘', '«', '»', '“']);
const PLURAL_ENTRY = new RegExp(
  `(?:^|[^${LETTER}])(der|die|das) ([A-ZÄÖÜ][a-zäöüß]{2,})${NOT_LETTER_AHEAD}[^\\n]{0,30}?` +
    `(?:(?:\\(|–\\s*|-\\s*)(?:(?:pl\\.|Pl\\.|Plural|plural):?\\s*(?:die )?|die )` +
    `|,\\s*(?:pl\\.|Pl\\.|Plural|plural)?:?\\s*(?:die )?)` +
    `([A-ZÄÖÜ][a-zäöüß]{2,})\\)?`,
  'gm',
);
const PLURAL_MARKER_BEFORE = /(?:plural|pl\.)\s*:?\s*$/i;
const NO_PLURAL = /(no plural|kein Plural|nur Singular|Singular only|ohne Plural)/i;
const CASE_CONTEXT = /(Genitiv|Dativ|genitive|dative)/i;
/** A noun right before an article: "die Farbe der Sonne", a genitive attribute. */
const NOUN_BEFORE = /^[A-ZÄÖÜ][a-zäöüß]{2,}$/;
/** Verbs with a dative object, whatever the form: "Ich helfe der Frau", "Das gehört der Lehrerin". */
const DATIVE_VERB_BEFORE = new RegExp(
  `^(?:${'helf hilf dank gefall gefäll gehör antwort folg glaub gratulier pass schmeck zuhör geb gib gab zeig schenk sag erklär bring schick kauf empfehl empfiehl wünsch erzähl vertrau begegn fehl geling gelang reich leih verzeih widersprech widersprich'
    .split(' ')
    .join('|')})[${LETTER}]*$`,
  'i',
);
const LETTER_RE = new RegExp(`[${LETTER}]`);

/** The character before `pos`, skipping spaces; '' at the start of the text. */
function charBefore(text: string, pos: number): string {
  let i = pos - 1;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i -= 1;
  return i >= 0 ? text[i] : '';
}

/** The word before `pos`, skipping spaces and emphasis marks; '' when a line, a bullet or the text starts there. */
function wordBefore(text: string, pos: number): string {
  let i = pos - 1;
  while (i >= 0 && ' \t*_'.includes(text[i])) i -= 1;
  const end = i + 1;
  while (i >= 0 && LETTER_RE.test(text[i])) i -= 1;
  return text.slice(i + 1, end);
}

/** Spans inside quotation marks or ~~strikethrough~~ on one line: quoted mistakes are not the tutor's claims. */
export function quotedSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const pairs: [RegExp][] = [[/„[^“”"\n]{2,200}[“”"]/g], [/"[^"\n]{2,200}"/g], [/'[^'\n]{4,200}'/g], [/~~[^~\n]{2,200}~~/g], [/«[^»\n]{2,200}»/g]];
  for (const [re] of pairs) {
    for (const m of text.matchAll(re)) spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  return spans;
}

const inSpans = (spans: [number, number][], pos: number) => spans.some(([a, b]) => pos >= a && pos < b);

// ------------------------------------------------------------------------------------------------
// article + adjective + noun agreement ("eine kleine Geschenk", "die nächste Bahnhof")
// ------------------------------------------------------------------------------------------------

// Attributive stems of frequent adjectives (the form before the ending: klein-e, teur-e, dunkl-e, hoh-e). Only a
// phrase whose adjective is listed is judged, so a relative pronoun followed by a verb or an adverb ("die gerne
// Kaffee trinkt", "der heute Brot kauft") never looks like a noun phrase. Comparatives and superlatives of
// listed stems are accepted too (-er, -st, -est), the umlauted ones are listed.
const ADJECTIVE_STEMS = new Set(
  `klein groß gut schön alt neu jung lang kurz schlecht richtig falsch wichtig interessant einfach schwer leicht
  teur billig frisch kalt warm heiß kühl nett freundlich ruhig laut leis still schnell langsam früh spät ganz halb
  ander nächst letzt erst zweit dritt viert fünft sechst siebt acht neunt zehnt vorletzt best meist besser größ größt
  ält ältest jüng jüngst läng längst kürz kürzest kält kältest wärm wärmst stärk stärkst schwäch höh höher höchst
  näh näher nah weit fern hoh tief flach breit schmal eng dick dünn weich hart hell dunkl hübsch bequem gemütlich
  lustig komisch traurig glücklich zufrieden froh nervös stolz mutig klug dumm fleißig faul pünktlich höflich ehrlich
  geduldig fertig bereit genau normal bestimmt gleich verschieden unterschiedlich ähnlich eigen eigentlich einzig
  einzeln übrig gesamt öffentlich privat täglich wöchentlich monatlich jährlich deutsch englisch französisch
  spanisch italienisch türkisch europäisch international national modern typisch berühmt bekannt beliebt perfekt
  toll lecker gesund krank müd sauber schmutzig voll leer offen geschlossen frei besetzt lieb link recht ober unter
  äußer inner vorder hinter wichtig nötig notwendig möglich unmöglich sicher gefährlich schwierig kompliziert klar
  deutlich konkret allgemein speziell besonder persönlich beruflich sozial politisch wirtschaftlich kulturell
  historisch praktisch theoretisch technisch medizinisch musikalisch sportlich kreativ aktiv positiv negativ direkt
  komplett doppelt zusätzlich kostenlos günstig preiswert wertvoll arm reich süß saur salzig scharf bitter mild roh
  reif trocken nass feucht sonnig regnerisch windig wolkig neblig rot blau grün gelb schwarz weiß grau braun bunt
  rund eckig golden silbern hölzern gläsern echt falsch wahr ernst streng mild lieb böse weis wild zahm fremd
  eigen ledig verheiratet geschieden berufstätig arbeitslos selbstständig erfahren gebraucht geöffnet folgend
  kommend vergangen vorig spannend passend laufend aktuell dringend regelmäßig häufig selten üblich gewöhnlich
  ständig weiter zahlreich mehrer einig wenig viel sämtlich gering niedrig stark schwach dicht locker fest lose
  kaputt heil ganz fit satt hungrig durstig wach schläfrig krank gesund ernst witzig klassisch romantisch
  spannend langweilig interessant berühmt wunderbar wunderschön herrlich furchtbar schrecklich fantastisch prima
  super ideal optimal real wahr sinnvoll nützlich hilfreich wichtig bekannt unbekannt klein winzig riesig gewaltig
  enorm mittler durchschnittlich zentral örtlich regional städtisch ländlich eigen fremd ausländisch inländisch
  elektrisch digital mobil fest flüssig sauer`.split(/\s+/).filter(Boolean),
);
const ADVERB_BEFORE_ADJ = '(?:(?:sehr|ganz|so|zu|wirklich|ziemlich|besonders|total|echt|recht|relativ|etwas)[ \t]+)?';
const EIN_WORDS = '(?:[Ee]in|[Kk]ein|[Mm]ein|[Dd]ein|[Ss]ein|[Uu]nser)';
const ADJ_TOKEN = `([a-zäöüß]{3,})(e|en|er|es)`;
const NOUN_TOKEN = `([A-ZÄÖÜ][a-zäöüß]{2,})`;
const DEF_ADJ_NOUN = new RegExp(`(?:^|[^${LETTER}])([Dd]er|[Dd]ie|[Dd]as)[ \t]+${ADVERB_BEFORE_ADJ}([a-zäöüß]{3,})e[ \t]+${NOUN_TOKEN}(?![${LETTER}])`, 'gm');
const EIN_ADJ_NOUN = new RegExp(`(?:^|[^${LETTER}])${EIN_WORDS}(e|en|em|er|es)?[ \t]+${ADVERB_BEFORE_ADJ}${ADJ_TOKEN}[ \t]+${NOUN_TOKEN}(?![${LETTER}])`, 'gm');
const EIN_NOUN = new RegExp(`(?:^|[^${LETTER}])${EIN_WORDS}(e|en)?[ \t]+${NOUN_TOKEN}(?![${LETTER}])`, 'gm');
// "ein bisschen Zeit", "um ein Uhr": not noun phrases with an article
const NOT_AN_ADJECTIVE = new Set(['bissch', 'paar', 'wenig']);
const NOT_AFTER_EIN = new Set(['Uhr']);
const ARTICLE_GENUS: Record<Article, Genus> = { der: 'm', die: 'f', das: 'n' };
const GENUS_KEY: Record<Genus, string> = { m: 'lex.masculine', f: 'lex.feminine', n: 'lex.neuter' };
const orList = (xs: string[]) => xs.join(t('lex.or'));

/** Ein-word ending + adjective ending → the genera the pair can agree with (empty: no genus, always wrong). */
function einGenera(det: string, adj: string): Genus[] | null {
  if (det === '') return adj === 'er' ? ['m'] : adj === 'es' ? ['n'] : [];
  if (det === 'e') return adj === 'e' ? ['f'] : adj === 'en' ? null : [];
  if (det === 'en') return adj === 'en' ? ['m'] : [];
  if (det === 'em') return adj === 'en' ? ['m', 'n'] : [];
  if (det === 'er') return adj === 'en' ? ['f'] : [];
  return adj === 'en' ? ['m', 'n'] : []; // "es": genitive
}

function adjectiveKnown(stem: string): boolean {
  if (NOT_AN_ADJECTIVE.has(stem)) return false;
  if (ADJECTIVE_STEMS.has(stem)) return true;
  if (stem.endsWith('est') && ADJECTIVE_STEMS.has(stem.slice(0, -3))) return true;
  if ((stem.endsWith('er') || stem.endsWith('st')) && ADJECTIVE_STEMS.has(stem.slice(0, -2))) return true;
  return false;
}

/** The genera of a noun the lexicon knows, directly or through the last part of a compound. */
function generaOf(lex: LexiconIndex, noun: string): Genus[] {
  const direct = lex.articlesOf(noun);
  if (direct.length) return direct.map((a) => ARTICLE_GENUS[a]);
  const split = lex.compoundSplit(noun);
  return split ? lex.articlesOf(split.last).map((a) => ARTICLE_GENUS[a]) : [];
}

/** The correct nominative (and, for masculines, accusative) forms of a phrase for one genus. */
function agreedForms(kind: 'def' | 'ein', stem: string, adj: string | null, noun: string, g: Genus): string[] {
  const a = adj ?? '';
  if (kind === 'def') return [`${GENUS_ARTICLE[g]} ${adj ? `${a}e ` : ''}${noun}`];
  if (g === 'f') return [`${stem}e ${adj ? `${a}e ` : ''}${noun}`];
  if (g === 'n') return [`${stem} ${adj ? `${a}es ` : ''}${noun}`];
  return [`${stem} ${adj ? `${a}er ` : ''}${noun}`, `${stem}en ${adj ? `${a}en ` : ''}${noun}`];
}

function agreementFindings(text: string, lex: LexiconIndex, spans: [number, number][], seen: Set<string>): LexFinding[] {
  const out: LexFinding[] = [];
  // emphasis marks become spaces (same indices), so "**eine kleine** Geschenk" reads as one phrase
  const clean = text.replace(/[*_~]/g, ' ');
  // the match may start with the one non-letter character before the determiner
  const phraseOf = (m: RegExpMatchArray) => {
    const lead = new RegExp(`^[^${LETTER}]`).test(m[0]) ? 1 : 0;
    return { index: (m.index ?? 0) + lead, phrase: m[0].slice(lead).replace(/[ \t]+/g, ' ') };
  };
  const emit = (m: RegExpMatchArray, kind: 'def' | 'ein', detEnding: string, adj: string | null, noun: string, genera: Genus[], allowed: Genus[]) => {
    if (genera.some((g) => allowed.includes(g))) return;
    const { index, phrase } = phraseOf(m);
    if (lex.isPluralForm(noun) || inSpans(spans, index)) return;
    const key = `agree:${phrase}`;
    if (seen.has(key)) return;
    seen.add(key);
    const det = phrase.split(' ')[0];
    const stem = (detEnding ? det.slice(0, -detEnding.length) : det).toLowerCase();
    const expected = genera.flatMap((g) => agreedForms(kind, stem, adj, noun, g));
    // a wrong form next to the right one is the tutor contrasting them, not a claim
    const before = charBefore(text, index);
    if ((QUOTE_BEFORE.has(before) || before === '*' || before === '_') && expected.some((e) => clean.includes(e))) return;
    out.push({
      kind: 'agreement',
      claimed: phrase,
      expected: expected.join(' / '),
      note: t('lex.agreementNote', { noun, genus: orList(genera.map((g) => t(GENUS_KEY[g]))), forms: orList(expected.map((e) => `“${e}”`)) }),
      index,
    });
  };

  for (const m of clean.matchAll(DEF_ADJ_NOUN)) {
    const [, article, stem, noun] = m;
    if (!adjectiveKnown(stem)) continue;
    const genera = generaOf(lex, noun);
    if (!genera.length) continue;
    emit(m, 'def', '', stem, noun, genera, [ARTICLE_GENUS[article.toLowerCase() as Article]]);
  }
  for (const m of clean.matchAll(EIN_ADJ_NOUN)) {
    const [, detEnding = '', stem, adjEnding, noun] = m;
    if (!adjectiveKnown(stem)) continue;
    const allowed = einGenera(detEnding, adjEnding);
    if (!allowed) continue;
    const genera = generaOf(lex, noun);
    if (!genera.length) continue;
    emit(m, 'ein', detEnding, stem, noun, genera, allowed);
  }
  for (const m of clean.matchAll(EIN_NOUN)) {
    const [, detEnding = '', noun] = m;
    if (NOT_AFTER_EIN.has(noun)) continue;
    const genera = generaOf(lex, noun);
    if (!genera.length) continue;
    const allowed: Genus[] = detEnding === '' ? ['m', 'n'] : detEnding === 'e' ? ['f'] : ['m'];
    emit(m, 'ein', detEnding, null, noun, genera, allowed);
  }
  return out;
}

/**
 * Checks one model answer against the lexicon. Conservative on positions (citation position only, as the
 * release gate does), and it ignores quoted text, where the tutor is showing a learner's mistake.
 * `ignore` removes the learner's own text before checking (a correction quotes it).
 */
export function checkText(raw: string, lex: LexiconIndex, ignore: string[] = []): LexReport {
  let text = raw;
  for (const s of ignore) if (s.trim().length > 3) text = text.split(s).join(' '.repeat(s.length));
  const spans = quotedSpans(text);
  const report: LexReport = { findings: [], verified: [], unknown: [] };
  const seen = new Set<string>();

  for (const m of text.matchAll(CITE)) {
    const index = m.index ?? 0;
    const before = charBefore(text, index);
    if (before !== '' && !CITE_BEFORE.has(before)) continue;
    const article = m[1] as Article;
    const noun = m[2];
    const key = `${article} ${noun}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const genera = lex.articlesOf(noun);
    if (genera.length) {
      if (genera.includes(article) || (article === 'die' && lex.isPluralForm(noun))) {
        report.verified.push({ article, noun, index });
        continue;
      }
      if (article === 'die' && PLURAL_MARKER_BEFORE.test(text.slice(Math.max(0, index - 12), index))) continue;
      if (QUOTE_BEFORE.has(before) && genera.some((g) => text.includes(`${g} ${noun}`))) continue;
      if (inSpans(spans, index)) continue;
      if (article === 'der' && genera.includes('die')) {
        // "der Mutter" is the genitive/dative of a feminine noun when the answer also says "die Mutter", explains
        // a case anywhere before (a "Genitiv" heading covers the whole answer), puts it after a case preposition
        // ("außerhalb der Schule"), after another noun ("die Farbe der Sonne") or after a verb with a dative
        // object ("Ich helfe der Frau")
        const upTo = text.slice(0, index + m[0].length + 80);
        const afterPrep = new RegExp(`(?:^|[^${LETTER}])(?:${CASE_PREPOSITIONS}) der ${escapeRe(noun)}${NOT_LETTER_AHEAD}`, 'i').test(text);
        const previous = wordBefore(text, index);
        if (text.includes(`die ${noun}`) || CASE_CONTEXT.test(upTo) || afterPrep || NOUN_BEFORE.test(previous) || DATIVE_VERB_BEFORE.test(previous)) continue;
      }
      const expected = `${genera.join('/')} ${noun}`;
      report.findings.push({
        kind: 'gender',
        claimed: key,
        expected,
        note: t('lex.genderNote', { noun, articles: orList(genera.map((g) => `“${g}”`)), article }),
        index,
      });
    } else if (!lex.isKnown(noun) && !lex.isCompound(noun)) {
      report.unknown.push(key);
    }
  }

  report.findings.push(...agreementFindings(text, lex, spans, seen));

  for (const m of text.matchAll(PLURAL_ENTRY)) {
    const [, article, noun, plural] = m;
    const forms = lex.pluralsOfLemma(noun);
    if (!forms.length || plural === noun || NO_PLURAL.test(m[0])) continue;
    if (forms.includes(plural)) continue;
    const index = (m.index ?? 0) + m[0].indexOf(article);
    if (inSpans(spans, index)) continue;
    // only a form that looks like an attempt at this noun's plural, and is not another noun or a compound
    if (plural.slice(0, 3).toLowerCase() === noun.slice(0, 3).toLowerCase() && !lex.articlesOf(plural).length && !lex.isCompound(plural)) {
      report.findings.push({
        kind: 'plural',
        claimed: `${article} ${noun}, plural ${plural}`,
        expected: `die ${forms.join(' / die ')}`,
        note: t('lex.pluralNote', { noun, forms: orList(forms.map((f) => `“${f}”`)) }),
        index,
      });
    }
  }

  for (const check of lex.paradigmChecks) {
    const { verb } = check;
    for (const re of check.wrongForm) {
      for (const m of text.matchAll(re)) {
        const index = m.index ?? 0;
        if (inSpans(spans, index)) continue;
        report.findings.push({
          kind: 'verb',
          claimed: m[0].replace(/^[^A-Za-zÄÖÜäöüß]+/, '').trim(),
          expected: `… ${verb.participle}`,
          note: t('lex.participleNote', { verb: verb.infinitive, participle: verb.participle }),
          index,
        });
      }
    }
    if (check.habenWithSein) {
      for (const m of text.matchAll(check.habenWithSein)) {
        const index = m.index ?? 0;
        if (inSpans(spans, index)) continue;
        report.findings.push({
          kind: 'verb',
          claimed: m[0].replace(/^[^A-Za-zÄÖÜäöüß]+/, '').trim(),
          expected: `sein + ${verb.participle}`,
          note: t('lex.auxNote', { verb: verb.infinitive, aux: 'sein' }),
          index,
        });
      }
    }
    if (check.seinWithHaben) {
      for (const m of text.matchAll(check.seinWithHaben)) {
        const index = m.index ?? 0;
        if (inSpans(spans, index)) continue;
        report.findings.push({
          kind: 'verb',
          claimed: m[0].replace(/^[^A-Za-zÄÖÜäöüß]+/, '').trim(),
          expected: `haben + ${verb.participle}`,
          note: t('lex.auxNote', { verb: verb.infinitive, aux: 'haben' }),
          index,
        });
      }
    }
  }
  report.findings.sort((a, b) => a.index - b.index);
  return report;
}

/**
 * Whether a levelled noun belongs in a drill pool. The A1-B2 tiers of the lexicon are curated word lists and go
 * in as they are; the C1 tier was harvested from course texts and carries one-off compounds and proper nouns
 * ("Chinabaum", "Geissenpeter"), so there a word must have been seen in the corpus at least once (a C2 tier,
 * should a data release add one, is treated the same way; v16 has none, so a C2 pool is the pool up to C1). The
 * core lexicon is cut by the same rule in scripts/build-data.mjs, so it has no `freq` to check.
 */
export function drillable(n: LexNoun): boolean {
  const l = cefrOf(n.level);
  if (!l || !n.meaning) return false;
  return (l !== 'C1' && l !== 'C2') || n.freq === undefined || n.freq >= 1;
}

/** Nouns with a meaning at the learner's level or below (or exactly at `only`): the drill pool. */
export function nounsUpTo(lex: LexiconIndex, level: Level, only: Level | null = null): LexNoun[] {
  return lex.nouns.filter((n) => {
    if (!drillable(n)) return false;
    const l = cefrOf(n.level) as Level;
    return only ? l === only : atOrBelow(l, level);
  });
}
