#!/usr/bin/env node
// Writes src/data/words.json, the word list behind the Word tiles game (src/harness/scrabble.ts): the German word
// forms the game can confirm on its own, without the model. Nouns come from the lexicon at play time (the full
// lexicon once it is downloaded with the model, the bundled core before that), so this file carries what the
// lexicon does not have: the lowercase forms (verbs, adjectives, pronouns, prepositions, numbers...) that occur in
// the app's own German texts (scene lines, grammar examples, talking points, lexicon examples), a hand-written
// list of closed-class words and valid two-letter words, the commonest adjectives with their declined and compared
// forms, the conjugated forms of the irregular verbs in the lexicon and of the commonest regular ones, plus the nouns those texts use, checked against the full lexicon in
// .model-cache/ (so they are known even before the full lexicon is on the phone), with their plurals. Everything
// the texts contain is curated German, so every harvested form is a real word; a word in none of these lists is
// not wrong, it is simply one the other player has to accept.
//
// On top of that come the words the app's own model named when asked (src/data/model-words.json, written by
// scripts/model-words.mjs): adjectives are declined and compared by rule, verbs conjugated from the lexicon's
// parts, from a known base verb (aufstehen from stehen) or, where the model's own answer was exactly the weak
// pattern, by rule (any other verb gets its present tense only), adverbs stand as they are, and nouns join with
// the gender the lexicon attests. Two checks against the texts come first: a word spelled exactly like its English
// meaning ("funky") counts only if the German texts use it, and an adjective that is a text word plus an ending
// ("laute") is that word's form, not a lemma. Those words also bring a meaning (`meanings`) and the lemma each
// inflected form belongs to (`lemmaOf`), so a laid "schnelle" can be shown as "schnell · fast".
//
//   node scripts/build-words.mjs            (run after build-data.mjs, which refreshes .model-cache/lexicon.json)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  composeParts,
  IRREGULAR_FULL,
  irregularForms,
  isRegularParts,
  linkingE,
  normaliseParts,
  regularForms,
  regularParticiple,
  regularPresent,
  regularPreterite,
  stemOf,
} from './lib/verbs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, '..', 'src', 'data');
const read = (name) => JSON.parse(readFileSync(join(data, name), 'utf8'));

const scenes = read('scenes.json');
const grammar = read('grammar.json');
const together = read('together.json');
const rules = read('rules.json');
const core = read('lexicon-core.json');
const fullPath = join(here, '..', '.model-cache', 'lexicon.json');
const full = existsSync(fullPath) ? JSON.parse(readFileSync(fullPath, 'utf8')) : null;
if (!full) console.warn('no .model-cache/lexicon.json: run build-data.mjs first; nouns are checked against the core lexicon only');
const modelWordsPath = join(data, 'model-words.json');
const modelWords = existsSync(modelWordsPath) ? JSON.parse(readFileSync(modelWordsPath, 'utf8')).words : {};
if (!Object.keys(modelWords).length) console.warn('no src/data/model-words.json: run scripts/model-words.mjs to add the model-named words');

// ------------------------------------------------------------------------------------------------
// the German texts (only fields that are German: never glosses, translations or the deliberately wrong lines)
// ------------------------------------------------------------------------------------------------

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const cefrIndex = (level) => CEFR.indexOf(String(level ?? '').slice(0, 2));

const texts = [];
/** The level of the card, scene or question a text belongs to (-1 where it has none), so a noun can be dated to where a learner first meets it. */
const textLevels = [];
const add = (level, ...items) => {
  for (const item of items) {
    texts.push(item);
    textLevels.push(cefrIndex(level));
  }
};
for (const s of scenes) {
  add(s.level, s.situation_de, s.role_de, s.learner_de, s.opening);
  for (const f of s.facts ?? []) add(s.level, f.label_de);
  for (const b of s.beats ?? []) add(s.level, ...(b.learner ?? []), b.reply);
}
for (const g of grammar) {
  add(g.level, g.title_de, g.rule_de);
  for (const [de] of g.examples ?? []) add(g.level, de);
  for (const p of g.pitfalls ?? []) add(g.level, p.right, p.why_de);
}
for (const p of together) add(p.level, p.q);
for (const r of Object.values(rules)) add(null, r.de);
for (const n of core.nouns) add(n.level, n.example);

const LETTERS = /^[A-Za-zÄÖÜäöüß]+$/;
/** English words the grammar notes compare with ("like 'have been'"); none is German. */
const ENGLISH = new Set(['ago', 'have', 'been', 'or', 'at', 'get', 'is', 'if', 'to', 'the', 'and', 'you', 'are', 'was', 'were', 'will', 'would', 'should', 'can', 'could', 'of', 'it', 'be', 'do', 'does', 'did', 'not']);
/** First names, places and other proper nouns the texts use; the lexicon lists them with a gender, Scrabble does not allow them. */
const PROPER = new Set(
  `Alex Anna Ben Lisa Paul Max Tom Tommy Marianne Huber Müller Schmidt Schiller Goethe Einstein Pascal Rex Robinson Hades Demeter Persephone Dada
   China Paris Rom Wien Berlin Hamburg München Köln Mars Sahara Deutschland Österreich Schweiz Europa Amerika Italien Frankreich Spanien England
   Türkei Russland Polen Bayern Rhein Donau Alpen Lindenstraße Ostbahnhof Oktoberfest`.split(/\s+/),
);
const lower = new Set();
const capitalised = new Map(); // word -> seen mid-sentence
const firstMet = new Map(); // capitalised word -> lowest level index of a text using it
for (const [index, text] of texts.entries()) {
  if (typeof text !== 'string') continue;
  const level = textLevels[index];
  // a token after sentence punctuation (or the first one) may be a capitalised function word, not a noun
  let startOfSentence = true;
  for (const raw of text.split(/\s+/)) {
    const w = raw.replace(/^[„“"'(«»‚‘]+|[„“"'),.!?:;«»‚‘…]+$/g, '');
    const ends = /[.!?:…]$/.test(raw) || /[.!?:…]["“»)]*$/.test(raw);
    // a rule text names prefixes and suffixes ("be-", "-lich") and the odd English word; neither is a word to lay
    if (!LETTERS.test(w) || w.length < 2 || w.length > 15 || ENGLISH.has(w.toLowerCase())) {
      startOfSentence = ends || startOfSentence;
      continue;
    }
    if (/^[a-zäöüß]+$/.test(w)) lower.add(w);
    else if (/^[A-ZÄÖÜ][a-zäöüß]+$/.test(w)) {
      capitalised.set(w, (capitalised.get(w) ?? false) || !startOfSentence);
      if (level >= 0 && !(firstMet.get(w) <= level)) firstMet.set(w, level);
    }
    startOfSentence = ends;
  }
}
// a capitalised word that also occurs in lowercase is a sentence-initial function word, not a noun
for (const w of capitalised.keys()) {
  const lc = w.toLowerCase();
  if (lower.has(lc)) capitalised.delete(w);
}

// ------------------------------------------------------------------------------------------------
// closed-class words and the forms of common verbs
// ------------------------------------------------------------------------------------------------

const CLOSED = `
ab ah am an au da du eh ei er es ex he im in ja je na nu ob oh so tu um wo zu äh
ich du er sie es wir ihr mich dich ihn uns euch mir dir ihm ihnen
mein meine meinen meinem meiner meines dein deine deinen deinem deiner deines sein seine seinen seinem seiner seines
unser unsere unseren unserem unserer unseres euer eure euren eurem eurer eures ihre ihren ihrem ihrer ihres
man jemand jemanden jemandem niemand niemanden niemandem etwas nichts alles alle allen allem aller jeder jede jedes jeden jedem
dieser diese dieses diesen diesem jener jene jenes jenen jenem welcher welche welches welchen welchem
wer wen wem wessen was sich selbst selber einander
der die das den dem des ein eine einen einem einer eines kein keine keinen keinem keiner keines
an auf aus bei bis durch für gegen hinter in mit nach neben ohne seit über um unter von vor zu zwischen
trotz während wegen statt anstatt entlang gegenüber innerhalb außerhalb oberhalb unterhalb jenseits laut dank
ans am im ins vom zum zur beim aufs ums übers unters
und oder aber denn sondern weil dass ob wenn als obwohl damit bevor nachdem sobald solange falls sowie sowohl weder noch entweder
also auch nur sehr nicht nein doch mal dann dort hier heute morgen gestern jetzt immer nie oft manchmal selten bald später früher
wieder gern gerne vielleicht leider eigentlich wirklich ziemlich fast ganz genau etwa sogar zuerst zuletzt endlich plötzlich trotzdem
deshalb darum deswegen dafür dagegen davon dazu darüber darunter daran darauf dabei danach davor damit wohin woher wann warum wie wieso weshalb
hin her weg los zurück oben unten links rechts vorne vorn hinten drinnen draußen überall nirgends irgendwo irgendwann irgendwie zusammen allein
bitte danke hallo tschüss okay
mehr weniger viel viele vielen vieler wenig wenige wenigen mehrere einige beide beiden andere anderen anderem anderer anderes gleich nächste nächsten letzte letzten ganze ganzen halbe halben
null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn
zwanzig dreißig vierzig fünfzig sechzig siebzig achtzig neunzig hundert tausend erste ersten zweite zweiten dritte dritten halb viertel
`
  .split(/\s+/)
  .filter(Boolean);

/** The commonest adjectives; declined and compared by rule below, like the model-named ones. */
const ADJECTIVES = `
gut schlecht groß klein alt neu jung lang kurz schnell langsam schön warm kalt heiß kühl hell dunkel laut leise
teuer billig früh spät nah weit hoch tief breit schmal dick dünn schwer leicht stark schwach reich arm voll leer
rot blau grün gelb weiß schwarz grau braun rosa lila bunt rund frei müde krank gesund satt froh traurig böse lieb nett freundlich klug dumm
fertig offen wach echt falsch richtig wahr wichtig möglich nötig einfach schwierig bequem sauber schmutzig nass trocken süß sauer salzig bitter scharf frisch ruhig
`
  .split(/\s+/)
  .filter(Boolean);

/** Common regular (weak) verbs; their forms follow from the stem. */
const REGULAR_VERBS = `
machen sagen fragen antworten lernen hören spielen arbeiten wohnen leben kaufen kochen suchen zeigen warten brauchen
lieben lachen weinen tanzen reisen zahlen bezahlen kosten versuchen erzählen erklären glauben meinen hoffen wünschen danken
öffnen schmecken frühstücken putzen packen holen legen stellen setzen schicken führen folgen fehlen passen reichen
besuchen bestellen bezahlen erleben erreichen verdienen verkaufen vermieten überlegen wiederholen telefonieren studieren
fotografieren probieren reparieren diskutieren informieren interessieren funktionieren organisieren passieren feiern
ändern erinnern wandern klettern lächeln sammeln regnen rechnen zeichnen begegnen trainieren joggen surfen grillen
`
  .split(/\s+/)
  .filter(Boolean);

/** Letters a grammar note spells out ("ie", "ss") and separable prefixes that stand alone in a sentence ("stellt ... dar"). */
const NOT_WORDS = new Set(['ie', 'mm', 'ss', 'dar']);

const forms = new Set(lower);
for (const w of [...CLOSED, ...ADJECTIVES]) forms.add(w);
for (const w of IRREGULAR_FULL) forms.add(w);
const lexiconVerbs = Object.fromEntries((full?.verbs ?? core.verbs).map((v) => [v.infinitive, normaliseParts(v)]));
/** A separable prefix is only split off a verb we know (an|kommen, but not an|tworten). */
const knownVerb = (base) => Boolean(lexiconVerbs[base] || REGULAR_VERBS.includes(base) || modelWords[base]?.pos === 'verb');
for (const v of REGULAR_VERBS) for (const f of regularForms(v, knownVerb)) forms.add(f);
for (const v of Object.values(lexiconVerbs)) for (const f of irregularForms(v)) forms.add(f);

// ------------------------------------------------------------------------------------------------
// the words the model named, inflected by rule
// ------------------------------------------------------------------------------------------------

/**
 * form -> lemma for the model's lowercase words, where the form is not the lemma itself. These forms are not
 * repeated in `forms`: the game reads its word set as forms + the keys of lemmaOf + the lowercase keys of meanings.
 */
const lemmaOf = {};
/** lemma -> English meaning, for the model's words (nouns only where the lexicon has none). */
const meanings = {};
const addForms = (lemma, list) => {
  for (const f of list) {
    if (!/^[a-zäöüß]{2,15}$/.test(f) || f === lemma) continue;
    if (!(f in lemmaOf)) lemmaOf[f] = lemma;
  }
};

/** Adjectives that take no endings and no comparison (ein rosa Hemd, das ist prima). */
const INDECLINABLE = new Set('rosa lila prima super klasse extra beige orange egal schade pleite quitt spitze bankrott mega'.split(' '));
/** Monosyllabic adjectives whose comparison takes an umlaut (alt → älter → am ältesten). */
const UMLAUT = new Set('alt arm dumm grob groß hart jung kalt klug krank kurz lang nah scharf schwach schwarz stark warm gesund oft'.split(' '));
/** Comparatives and superlatives no rule gives. */
const IRREGULAR_COMPARISON = { gut: ['besser', 'best'], viel: ['mehr', 'meist'], hoch: ['höher', 'höchst'], nah: ['näher', 'nächst'], gern: ['lieber', 'liebst'], groß: ['größer', 'größt'] };
const umlaut = (s) => s.replace(/(.*)([aou])/, (_, before, v) => before + { a: 'ä', o: 'ö', u: 'ü' }[v]);

/** The forms an adjective takes: the five declension endings, the comparative and the superlative with theirs. */
function adjectiveForms(lemma) {
  if (INDECLINABLE.has(lemma) || /a$/.test(lemma)) return [lemma];
  const ENDINGS = ['e', 'en', 'em', 'er', 'es'];
  // dunkel → dunkle, teuer → teure, müde → müden; hoch → hohe
  let stem = lemma;
  if (lemma === 'hoch') stem = 'hoh';
  else if (/el$/.test(lemma)) stem = `${lemma.slice(0, -2)}l`;
  else if (/[aeiouäöü]er$/.test(lemma)) stem = `${lemma.slice(0, -2)}r`;
  else if (/e$/.test(lemma)) stem = lemma.slice(0, -1);
  const out = [lemma, ...ENDINGS.map((e) => stem + e)];
  let [comparative, superlative] = IRREGULAR_COMPARISON[lemma] ?? [];
  if (!comparative) {
    const base = UMLAUT.has(lemma) ? umlaut(lemma) : lemma;
    let cStem = base;
    if (/el$/.test(base)) cStem = `${base.slice(0, -2)}l`;
    else if (/[aeiouäöü]er$/.test(base)) cStem = `${base.slice(0, -2)}r`;
    else if (/e$/.test(base)) cStem = base.slice(0, -1);
    comparative = `${cStem}er`;
    const sStem = /e$/.test(base) ? base.slice(0, -1) : base;
    // am ältesten, am frischesten, but am spannendsten, am praktischsten
    const linking = (/[dtsßzx]$/.test(sStem) && !/(end|ernd|elnd|et|ert|elt)$/.test(sStem)) || (/sch$/.test(sStem) && !/[aeiouäöü][^aeiouäöü]*[aeiouäöü]/.test(sStem));
    superlative = `${sStem}${linking ? 'est' : 'st'}`;
  }
  out.push(comparative, ...ENDINGS.map((e) => comparative + e), ...ENDINGS.map((e) => superlative + e));
  return out;
}

/** The parts of a known verb: the lexicon's, or a regular one's by rule (the hand list, or the model's where its answer was the weak pattern). */
function knownParts(infinitive) {
  if (lexiconVerbs[infinitive]) return lexiconVerbs[infinitive];
  if (REGULAR_VERBS.includes(infinitive) || modelWords[infinitive]?.regular) {
    return { infinitive, present_3sg: regularPresent(infinitive), preterite: regularPreterite(infinitive), participle: regularParticiple(infinitive, knownVerb) };
  }
  return null;
}

/** The forms of a model-named verb: lexicon parts, else those composed from a known base verb, else regular by rule, else the present tense only. */
function verbForms(infinitive, entry) {
  if (lexiconVerbs[infinitive]) return irregularForms(lexiconVerbs[infinitive]);
  const composed = composeParts(infinitive, knownParts);
  if (composed) return isRegularParts(infinitive, composed, knownVerb) ? regularForms(infinitive, knownVerb) : irregularForms(composed);
  if (entry.regular) return regularForms(infinitive, knownVerb);
  // a strong verb nobody knows the parts of: the forms that do not depend on them
  const stem = stemOf(infinitive);
  const e = linkingE(stem) ? 'e' : '';
  return [infinitive, `${stem}e`, `${stem}${e}st`, `${stem}${e}t`, `${stem}en`];
}

/**
 * Two checks the model cannot make for itself, against the app's own German texts. A word spelled exactly like
 * one of its English meanings ("funky", "spacious") counts only if the texts use it (modern, warm, fair do not
 * hurt; a few real loans go with the English). An adjective or adverb that is a text word plus a declension or
 * comparison ending ("laute", "stärker") is that word's form; the base is not a pronoun or particle (sich|er,
 * los|e, leid|er).
 */
const textWords = new Set([...lower, ...CLOSED, ...ADJECTIVES]);
const NOT_BASES = new Set(['sich', 'los', 'leid']);
const unumlaut = (w) => w.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
const skipped = {};
const skip = (why, lemma) => (skipped[why] ??= []).push(lemma);
const textWordForm = (lemma) => {
  const m = lemma.match(/^(.{3,}?)(e|er|en|em|es|ere|eren|erer|erem|eres|ste|sten|ster|stem|stes|este|esten|ester|estem|estes)$/);
  return m && [m[1], unumlaut(m[1])].find((b) => b !== lemma && textWords.has(b) && !NOT_BASES.has(b));
};
for (const [lemma, entry] of Object.entries(modelWords)) {
  if (entry.pos === 'noun') continue;
  const glossWords = entry.gloss.toLowerCase().replace(/^to\s+/, '').split(/[,;/]\s*|\s+or\s+/).map((g) => g.trim());
  if (glossWords.includes(lemma) && !textWords.has(lemma)) {
    skip('spelled like its English meaning and not in the texts', lemma);
    delete modelWords[lemma];
  } else if (entry.pos !== 'verb' && textWordForm(lemma)) {
    skip(`a form of a text word`, `${lemma} (${textWordForm(lemma)})`);
    delete modelWords[lemma];
  }
}

const modelNouns = {};
for (const [lemma, entry] of Object.entries(modelWords)) {
  if (entry.pos === 'noun') modelNouns[lemma] = entry;
  else if (entry.pos === 'verb') addForms(lemma, verbForms(lemma, entry));
}
for (const [lemma, entry] of Object.entries(modelWords)) {
  if (entry.pos === 'adj') addForms(lemma, adjectiveForms(lemma));
  else if (entry.pos === 'adv' || entry.pos === 'other') addForms(lemma, [lemma]);
}
// the hand-written adjectives inflect the same way; they carry a meaning only where the model named them too
for (const lemma of ADJECTIVES) addForms(lemma, adjectiveForms(lemma));
for (const [lemma, entry] of Object.entries(modelWords)) if (entry.pos !== 'noun' && /^[a-zäöüß]{2,15}$/.test(lemma)) meanings[lemma] = entry.gloss;

for (const w of [...forms]) if (!/^[a-zäöüß]{2,15}$/.test(w) || NOT_WORDS.has(w)) forms.delete(w);
for (const w of Object.keys(lemmaOf)) if (NOT_WORDS.has(w) || w in meanings) delete lemmaOf[w];
// a form the model's words account for is not repeated in the plain list
for (const w of [...forms]) if (w in lemmaOf || w in meanings) forms.delete(w);

// ------------------------------------------------------------------------------------------------
// the nouns the texts use, confirmed by the lexicon (the full one when cached), with their plurals
// ------------------------------------------------------------------------------------------------

const check = full?.check ?? {};
const coreGenus = Object.fromEntries(core.nouns.map((n) => [n.lemma, n.genus]));
const describedGenus = Object.fromEntries((full?.nouns ?? core.nouns).map((n) => [n.lemma, n.genus]));
/**
 * The upstream gender table is lenient on purpose (it is used to judge answers), so it lists a regional
 * "die Bus" next to "der Bus" and a dated "das Bereich". A laid word shows the gender a learner should
 * use; where two genders are two words in everyday German (das Band, der Band, die Band) both stay.
 */
const PRIMARY_GENUS = {
  Band: 'fmn', Bauer: 'm', Bereich: 'm', Bus: 'm', Domino: 'n', Erkenntnis: 'f', Euro: 'm', Event: 'n', Fall: 'm',
  Foto: 'n', Grad: 'm', Husten: 'm', Kaffee: 'm', Kilometer: 'm', Kundenservice: 'm', Loch: 'n', Luft: 'f', Maß: 'n',
  Mensch: 'm', Messer: 'n', Mikado: 'n', Moment: 'm', Monat: 'm', Orange: 'f', Pack: 'n', Pfand: 'n', Plastik: 'n',
  Poker: 'n', Quadratmeter: 'm', Radio: 'n', Rolle: 'f', Service: 'm', Staffel: 'f', Tag: 'm', Tee: 'm', Teller: 'm',
  Tempo: 'n', Viertel: 'n', Weizen: 'm', Wetter: 'n', Wurm: 'm', Zentimeter: 'm', Zyklon: 'm',
};
const lemmaPlurals = full?.lemma_plurals ?? {};
const describedMeaning = Object.fromEntries([...core.nouns, ...(full?.nouns ?? [])].filter((n) => n.meaning).map((n) => [n.lemma, n.meaning]));
const nouns = {};
for (const w of [...capitalised.keys(), ...Object.keys(modelNouns)]) {
  if (/^(Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)$/.test(w) || PROPER.has(w)) continue;
  const attested = check[w] ?? coreGenus[w];
  if (!attested) continue;
  nouns[w] = describedGenus[w] ?? PRIMARY_GENUS[w] ?? attested;
  if (modelNouns[w] && !describedMeaning[w]) meanings[w] = modelNouns[w].gloss;
}
const plurals = new Set();
for (const lemma of Object.keys(nouns)) for (const p of lemmaPlurals[lemma] ?? []) if (/^[A-ZÄÖÜ][a-zäöüß]{1,14}$/.test(p)) plurals.add(p);
for (const n of core.nouns) for (const p of n.plural) if (/^[A-ZÄÖÜ][a-zäöüß]{1,14}$/.test(p)) plurals.add(p);

// where a learner first meets each noun: the lexicon's level where it has one (the curated classification the
// drills use), else the level of the lowest card, scene or question whose German text uses it. Five letters
// draws its answers by this, so an A1 pair is not asked to guess "Ethik".
const lexiconLevel = Object.fromEntries((full?.nouns ?? core.nouns).map((n) => [n.lemma, cefrIndex(n.level)]));
const levels = {};
for (const lemma of Object.keys(nouns)) {
  const level = lexiconLevel[lemma] >= 0 ? lexiconLevel[lemma] : (firstMet.get(lemma) ?? cefrIndex(modelNouns[lemma]?.level));
  if (level >= 0) levels[lemma] = CEFR[level];
}

const sort = (a, b) => a.localeCompare(b, 'de');
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => sort(a, b)));
const out = {
  note: 'Generated by scripts/build-words.mjs from the German texts in src/data and the model-named words in model-words.json; see that script. Nouns carry their gender letters as in the lexicon (m, f, n); levels is the CEFR level a noun is first met at; meanings are English glosses for the model-named words; lemmaOf maps an inflected lowercase form to its lemma.',
  forms: [...forms].sort(sort),
  nouns: sorted(nouns),
  plurals: [...plurals].sort(sort),
  levels: sorted(levels),
  meanings: sorted(meanings),
  lemmaOf: sorted(lemmaOf),
};
writeFileSync(join(data, 'words.json'), JSON.stringify(out));
const modelCount = (pos) => Object.values(modelWords).filter((e) => e.pos === pos).length;
for (const [why, list] of Object.entries(skipped)) console.log(`model words skipped, ${why}: ${list.sort().join(' ')}`);
console.log(
  `words.json: ${out.forms.length} forms, ${Object.keys(out.nouns).length} nouns (${Object.keys(out.levels).length} levelled), ${out.plurals.length} plural forms, ${Object.keys(out.meanings).length} meanings, ${Object.keys(out.lemmaOf).length} inflected forms mapped (${capitalised.size} capitalised words seen in the texts, ${capitalised.size - Object.keys(nouns).length} not in the lexicon; model words: ${modelCount('adj')} adjectives, ${modelCount('verb')} verbs, ${modelCount('adv') + modelCount('other')} adverbs and others, ${modelCount('noun')} nouns)`,
);
