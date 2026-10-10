// The rule behind a correction, decided by code. The model's corrections are right far more often than its
// explanations (the model card: "the rule it gives can be a neighbouring rule or an invented one"), so the
// app reads what changed between the learner's sentence and the corrected one and, when the change matches
// a classic learner error, shows the verified rule sentence for it: the bilingual rule sentences the model's
// correction family was trained on, or a bullet of the rule notes that ship with the model. When no pattern
// matches with confidence, nothing is shown: a missing rule is better than a wrong one.

import ruleSentences from '../data/rules.json';
import { ruleSentence, ruleTitle } from '../i18n/content';
import type { DiffOp } from './diff';
import { tokenize } from './diff';
import type { GroundingPack } from './grounding';
import type { LexiconIndex } from './lexicon';
import { noteBullets } from './parse';
import type { Lang } from './route';

export interface RuleHit {
  kind: string;
  title: string;
  /** The verified rule sentence, in the explanation language. */
  rule: string;
  /** What it means for this sentence, e.g. "mit takes the dative: meine → meiner". */
  detail: string;
  source: 'rule-card' | 'note' | 'lexicon';
}

const RULES = ruleSentences as Record<string, { de: string; en: string }>;

const TITLES: Record<string, [string, string]> = {
  'verb-second': ['The verb comes second', 'Verb an zweiter Stelle'],
  'verb-final': ['The verb goes to the end', 'Verb am Ende'],
  'preposition-case': ['The preposition sets the case', 'Die Präposition bestimmt den Fall'],
  'accusative-preposition': ['The preposition takes the accusative', 'Präposition mit Akkusativ'],
  'two-way-preposition': ['Where or where to?', 'Wo oder wohin?'],
  'accusative-object': ['The direct object is accusative', 'Das direkte Objekt steht im Akkusativ'],
  'perfekt-auxiliary': ['Perfekt with haben or sein', 'Perfekt mit haben oder sein'],
  'tense-seit': ['seit with the present tense', 'seit mit Präsens'],
  'noun-gender': ['The noun’s gender', 'Das Genus des Nomens'],
  negation: ['Negation with kein', 'Verneinung mit kein'],
  bracket: ['The verb bracket', 'Die Satzklammer'],
  'dative-verb': ['A verb with the dative', 'Verb mit Dativ'],
  capitalisation: ['Nouns start with a capital', 'Nomen schreibt man groß'],
  age: ['Saying your age', 'Das Alter'],
  'impersonal-dative': ['How you feel: mir ist …', 'Befinden: mir ist …'],
  'place-preposition': ['Where or where to?', 'Wo oder wohin?'],
};

const PRON = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man']);
const FINITE = new Set(
  'bin bist ist sind seid war warst waren wart habe hast hat haben habt hatte hattest hatten hattet werde wirst wird werden werdet wurde wurden kann kannst können könnt konnte konnten muss musst müssen müsst musste mussten will willst wollen wollt wollte wollten darf darfst dürfen dürft durfte durften soll sollst sollen sollt sollte sollten möchte möchtest möchten möchtet mag magst mögen gehe gehst geht gehen komme kommst kommt kommen fahre fährst fährt fahren mache machst macht machen bleibe bleibst bleibt bleiben wohne wohnst wohnt wohnen arbeite arbeitest arbeitet arbeiten lerne lernst lernt lernen spiele spielst spielt spielen kaufe kaufst kauft kaufen esse isst essen trinke trinkst trinkt trinken heiße heißt heißen sehe siehst sieht sehen gebe gibst gibt geben nehme nimmst nimmt nehmen'.split(
    ' ',
  ),
);
const SUBORDINATORS = new Set(['dass', 'weil', 'obwohl', 'wenn', 'als', 'ob', 'damit', 'während', 'bevor', 'nachdem', 'seitdem', 'bis', 'sodass', 'falls', 'sobald', 'da', 'wann', 'warum', 'wo', 'wie', 'was']);
const DAT_PREPS = new Set(['aus', 'bei', 'mit', 'nach', 'seit', 'von', 'zu', 'gegenüber', 'ab']);
const ACC_PREPS = new Set(['durch', 'für', 'gegen', 'ohne', 'um', 'bis', 'entlang']);
const TWO_WAY = new Set(['an', 'auf', 'hinter', 'in', 'neben', 'über', 'unter', 'vor', 'zwischen']);
const DATIVE_VERBS = /^(erklären|erkläre|erklärst|erklärt|helfen|helfe|hilfst|hilft|helft|half|geholfen|danken|danke|dankst|dankt|gefallen|gefällt|gehören|gehört|antworten|antwortet|gratulieren|gratuliert|passen|passt|schmecken|schmeckt|fehlen|fehlt|folgen|folgt|zustimmen|stimme)$/;
const DETERMINER = /^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|kein|keine|keinen|keinem|keiner|keines|(mein|dein|sein|ihr|unser|euer|eur|ihr)(e|en|em|er|es)?)$/;
const HABEN = new Set(['habe', 'hast', 'hat', 'haben', 'habt', 'hatte', 'hatten']);
const SEIN = new Set(['bin', 'bist', 'ist', 'sind', 'seid', 'war', 'waren']);
const PUNCT = /^[.,;:!?]$/;

const low = (s: string) => s.toLowerCase();

interface Replacement {
  from: string[];
  to: string[];
  /** The unchanged token right before the change, in the corrected sentence. */
  before: string | null;
  /** The unchanged token right after the change. */
  after: string | null;
}

/** Pairs of removed and inserted runs, with their unchanged neighbours. */
function replacements(diff: DiffOp[]): Replacement[] {
  const out: Replacement[] = [];
  for (let i = 0; i < diff.length; i += 1) {
    const op = diff[i];
    if (op.type === 'same') continue;
    const del = op.type === 'del' ? op : diff[i + 1]?.type === 'del' ? diff[i + 1] : null;
    const ins = op.type === 'ins' ? op : diff[i + 1]?.type === 'ins' ? diff[i + 1] : null;
    if (del && ins && (diff[i + 1] === del || diff[i + 1] === ins)) i += 1;
    const prev = diff.slice(0, i).reverse().find((d) => d.type === 'same');
    const next = diff.slice(i + 1).find((d) => d.type === 'same');
    out.push({
      from: del ? tokenize(del.text) : [],
      to: ins ? tokenize(ins.text) : [],
      before: prev ? (tokenize(prev.text).at(-1) ?? null) : null,
      after: next ? (tokenize(next.text)[0] ?? null) : null,
    });
  }
  return out;
}

function bullet(grounding: GroundingPack | null, key: string, startsWith: string): string | null {
  const note = grounding?.blocks[key];
  if (!note) return null;
  return noteBullets(note).find((b) => b.startsWith(startsWith)) ?? null;
}

/**
 * Rules behind a correction. `original` is what the learner wrote, `corrected` the tutor's version and
 * `diff` the word diff between them; `lang` picks the language of the rule sentences.
 */
export function rulesForCorrection(original: string, corrected: string, diff: DiffOp[], lang: Lang, lex: LexiconIndex | null, grounding: GroundingPack | null): RuleHit[] {
  const hits: RuleHit[] = [];
  const add = (kind: string, rule: string | null, detail: string, source: RuleHit['source']) => {
    if (!rule || hits.some((h) => h.kind === kind)) return;
    const [en, de] = TITLES[kind] ?? [kind, kind];
    hits.push({ kind, title: ruleTitle(kind, en, de, lang === 'de' ? 'de' : undefined), rule, detail, source });
  };
  // the sentence is app content: the learner's app language, German when the tutor explains in German
  const sentence = (kind: string) => ruleSentence(kind, RULES[kind], lang === 'de' ? 'de' : undefined);
  const q = (s: string) => (lang === 'de' ? `„${s}“` : `“${s}”`);

  const o = tokenize(original);
  // a correction that offers alternatives ("… / …") is analysed by its first one
  const k = tokenize(corrected.split(' / ')[0]);
  const ow = o.map(low);
  const kw = k.map(low);

  // verb second: "Gestern ich bin" -> "Gestern bin ich"
  const subordinate = (ws: string[], upTo: number) => ws.slice(0, upTo).some((w, x) => SUBORDINATORS.has(w) && !(x === 0 && /^(wie|was|wo|wann|warum)$/.test(w)));
  for (let i = 2; i < ow.length; i += 1) {
    const verb = ow[i];
    if (!FINITE.has(verb)) continue;
    // the subject right before the verb: a pronoun ("ich bin") or article + noun ("die Firma hat")
    const nounSubject = i >= 3 && /^(der|die|das|ein|eine|mein|meine|dein|deine|unser|unsere)$/.test(ow[i - 2]) && /^[A-ZÄÖÜ]/.test(o[i - 1]);
    const subject = PRON.has(ow[i - 1]) ? [ow[i - 1]] : nounSubject ? [ow[i - 2], ow[i - 1]] : null;
    const before = ow[i - 1 - (subject?.length ?? 1)];
    if (!subject || before === undefined || PUNCT.test(before) || subordinate(ow, i - subject.length)) continue;
    const j = kw.indexOf(verb);
    if (j > 0 && kw.slice(j + 1, j + 1 + subject.length).join(' ') === subject.join(' ')) {
      const first = k.slice(Math.max(0, k.lastIndexOf(',', j) + 1), j).join(' ');
      add('verb-second', sentence('verb-second'), lang === 'de' ? `${q(k[j])} steht an zweiter Stelle, nach ${q(first)}.` : `${q(k[j])} comes second, after ${q(first)}.`, 'rule-card');
      break;
    }
  }

  // verb final: "weil ich bin krank" -> "weil ich krank bin"; also relative clauses ", die leben in …"
  const clauseEnd = (ws: string[], from: number) => {
    const e = ws.findIndex((w, x) => x > from && PUNCT.test(w));
    return e < 0 ? ws.length : e;
  };
  for (let s = 0; s < ow.length; s += 1) {
    const relative = /^(der|die|das|den|dem|deren|dessen)$/.test(ow[s]) && ow[s - 1] === ',';
    if (!relative && (!SUBORDINATORS.has(ow[s]) || (ow[s] === 'als' && !/,/.test(original)) || ow[s] === 'bis' || ow[s] === 'da' || ow[s] === 'was' || ow[s] === 'wie' || ow[s] === 'wo')) continue;
    const clause = ow.slice(s + 1, clauseEnd(ow, s));
    if (clause.length < 2) continue;
    // the finite verb: a known form, or the word right after the subject (after the relative pronoun)
    const candidates = new Set(clause.filter((w) => FINITE.has(w)));
    if (PRON.has(clause[0]) && clause[1] && !/^[A-ZÄÖÜ]/.test(o[s + 2] ?? '')) candidates.add(clause[1]);
    if (relative && /^[a-zäöüß]+$/.test(o[s + 1] ?? '')) candidates.add(clause[0]);
    const ks = kw.indexOf(ow[s], Math.max(0, s - 2));
    if (ks < 0) continue;
    const kclause = kw.slice(ks + 1, clauseEnd(kw, ks));
    const last = kclause.at(-1);
    const verb = [...candidates].find((v) => clause.at(-1) !== v && (last === v || (last !== undefined && FINITE.has(last) && kclause.includes(v) && v === last)));
    if (verb) {
      add('verb-final', sentence('verb-final'), lang === 'de' ? `Nach ${q(o[s])} steht ${q(verb)} am Ende.` : `After ${q(o[s])}, ${q(verb)} goes to the end.`, 'rule-card');
      break;
    }
  }

  // the age: "Ich bin 25 Jahre" / "Ich habe 30 Jahre alt" -> "Ich bin 25 Jahre alt"
  if (/\bbin\b[^.]*\bjahre alt\b/i.test(corrected) && !/\bbin\b[^.]*\bjahre alt\b/i.test(original)) {
    add('age', sentence('age'), lang === 'de' ? 'Ich bin … Jahre alt.' : 'Ich bin … Jahre alt (I am … years old).', 'rule-card');
  }
  // bodily sensations: "Ich habe kalt" -> "Mir ist kalt"
  if (/^(mir|dir|ihm|ihr|uns|euch) (ist|wird|geht)\b/i.test(corrected.trim()) && !/^(mir|dir|ihm|ihr|uns|euch)\b/i.test(original.trim())) {
    add('impersonal-dative', sentence('impersonal-dative'), corrected.split(/[.!?]/)[0], 'rule-card');
  }

  for (const r of replacements(diff)) {
    const a = r.from.map(low);
    const b = r.to.map(low);
    const prev = r.before ? low(r.before) : null;
    const a0 = a[0];
    const b0 = b[0];
    if (a.length === 1 && b.length === 1 && a0 !== b0) {
      // the case after a preposition: "mit meine" -> "mit meiner"
      if (prev && DETERMINER.test(a0) && DETERMINER.test(b0)) {
        if (DAT_PREPS.has(prev)) {
          add('preposition-case', sentence('preposition-case'), lang === 'de' ? `${q(r.before as string)} verlangt den Dativ: ${r.from[0]} → ${r.to[0]}.` : `${q(r.before as string)} takes the dative: ${r.from[0]} → ${r.to[0]}.`, 'rule-card');
          continue;
        }
        if (ACC_PREPS.has(prev)) {
          add('accusative-preposition', bullet(grounding, 'grammar-prepositions', 'Always Akkusativ'), lang === 'de' ? `${q(r.before as string)} verlangt den Akkusativ: ${r.from[0]} → ${r.to[0]}.` : `${q(r.before as string)} takes the accusative: ${r.from[0]} → ${r.to[0]}.`, 'note');
          continue;
        }
        if (TWO_WAY.has(prev)) {
          add('two-way-preposition', bullet(grounding, 'grammar-prepositions', 'Wechselpräpositionen'), `${r.before} ${r.to[0]} ${r.after ?? ''}`.trim(), 'note');
          continue;
        }
        if (prev && DATIVE_VERBS.test(prev)) {
          add('dative-verb', sentence('dative-verb'), `${r.before}: ${r.from[0]} → ${r.to[0]}`, 'rule-card');
          continue;
        }
      }
      // haben <-> sein in the Perfekt (only with a participle: "Ich habe 30 Jahre alt" is not a Perfekt)
      const participle = k.find((w) => /^ge[a-zäöüß]{3,}(t|en)$/.test(w) || (lex?.verb(w)?.participle === w && w !== lex?.verb(w)?.infinitive));
      if (participle && ((HABEN.has(a0) && SEIN.has(b0)) || (SEIN.has(a0) && HABEN.has(b0)))) {
        const verb = participle ? lex?.verb(participle) : undefined;
        const toSein = SEIN.has(b0);
        const rule = toSein ? bullet(grounding, 'grammar-perfekt', 'sein is used') : bullet(grounding, 'grammar-perfekt', 'All other verbs');
        add(
          'perfekt-auxiliary',
          rule,
          verb
            ? lang === 'de'
              ? `${verb.infinitive} bildet das Perfekt mit ${q(toSein ? 'sein' : 'haben')}: ${r.to[0]} ${participle}.`
              : `${verb.infinitive} forms the Perfekt with ${q(toSein ? 'sein' : 'haben')}: ${r.to[0]} … ${participle}.`
            : `${r.from[0]} → ${r.to[0]}`,
          'note',
        );
        continue;
      }
      // a masculine direct object: "ein Hund" -> "einen Hund"
      if ((!prev || !(DAT_PREPS.has(prev) || ACC_PREPS.has(prev) || TWO_WAY.has(prev) || prev === ',')) && r.after && /^[A-ZÄÖÜ]/.test(r.after) && /^(ein|kein|mein|dein|sein|ihr|unser|der)$/.test(a0) && (b0 === `${a0}en` || (a0 === 'der' && b0 === 'den'))) {
        add('accusative-object', sentence('accusative-object'), `${r.from[0]} ${r.after ?? ''} → ${r.to[0]} ${r.after ?? ''}`.replace(/\s+/g, ' ').trim(), 'rule-card');
        continue;
      }
      // the article of a noun, decided by the lexicon
      if (/^(der|die|das)$/.test(a0) && /^(der|die|das)$/.test(b0) && r.after && /^[A-ZÄÖÜ]/.test(r.after) && (!prev || !(DAT_PREPS.has(prev) || ACC_PREPS.has(prev) || TWO_WAY.has(prev)))) {
        const articles = lex?.articlesOf(r.after) ?? [];
        if (articles.length === 1 && articles[0] === b0) {
          add('noun-gender', sentence('noun-gender'), lang === 'de' ? `${r.after} hat den Artikel ${q(b0)} (Lexikon).` : `${r.after} takes ${q(b0)} (lexicon).`, 'lexicon');
          continue;
        }
      }
      // capitals: "haus" -> "Haus"
      if (a0 === b0.toLowerCase() && r.to[0] !== r.from[0] && /^[A-ZÄÖÜ]/.test(r.to[0]) && lex?.articlesOf(r.to[0]).length) {
        add('capitalisation', lang === 'de' ? 'Nomen schreibt man im Deutschen immer groß: das Haus, die Zeit.' : 'German nouns always start with a capital letter: das Haus, die Zeit.', `${r.from[0]} → ${r.to[0]}`, 'lexicon');
        continue;
      }
    }
    // a verb that takes the dative: "Ich helfe dich" -> "Ich helfe dir"
    if (a.length === 1 && b.length === 1 && /^(dich|mich|ihn|uns|euch)$/.test(a0) && /^(dir|mir|ihm|uns|euch|ihnen)$/.test(b0)) {
      const verb = k.find((w) => DATIVE_VERBS.test(low(w)));
      if (verb) {
        add('dative-verb', sentence('dative-verb'), `${verb} + ${r.to[0]}`, 'rule-card');
        continue;
      }
    }
    // "für drei Jahre" for a period that still continues -> "seit drei Jahren"
    if (a.length === 1 && b.length === 1 && a0 === 'für' && b0 === 'seit') {
      add('tense-seit', sentence('tense-seit'), lang === 'de' ? 'seit + Dativ für etwas, das noch andauert.' : 'seit + dative for something that still continues.', 'rule-card');
      continue;
    }
    // the article's ending follows the noun's gender: "kein Idee" -> "keine Idee", "deine Name" -> "dein Name"
    if (a.length === 1 && b.length === 1 && r.after && /^[A-ZÄÖÜ]/.test(r.after) && /^(ein|kein|mein|dein|sein|ihr|unser)e?$/.test(a0) && /^(ein|kein|mein|dein|sein|ihr|unser)e?$/.test(b0) && a0.replace(/e$/, '') === b0.replace(/e$/, '') && (!prev || !(DAT_PREPS.has(prev) || ACC_PREPS.has(prev) || TWO_WAY.has(prev)))) {
      const articles = lex?.articlesOf(r.after) ?? [];
      const feminine = articles.length === 1 && articles[0] === 'die';
      const masculineOrNeuter = articles.length === 1 && articles[0] !== 'die';
      if ((b0.endsWith('e') && feminine) || (!b0.endsWith('e') && masculineOrNeuter)) {
        add('noun-gender', sentence('noun-gender'), lang === 'de' ? `${articles[0]} ${r.after} (Lexikon): ${r.to[0]} ${r.after}.` : `${articles[0]} ${r.after} (lexicon): ${r.to[0]} ${r.after}.`, 'lexicon');
        continue;
      }
    }
    // where and where to: "zu Hause" / "nach Hause", "nach die Schweiz" -> "in die Schweiz"
    if (a.length === 1 && b.length === 1 && /^(zu|nach|in|bei)$/.test(a0) && /^(zu|nach|in|bei)$/.test(b0) && (r.after === 'Hause' || /^(die|den)$/.test(low(r.after ?? '')))) {
      add('place-preposition', sentence('place-preposition'), `${r.from[0]} → ${r.to[0]} ${r.after}`, 'rule-card');
      continue;
    }
    // "nicht ein" -> "kein"
    if (a.includes('nicht') && b.some((w) => /^kein(e|en|em|er|es)?$/.test(w))) {
      add('negation', sentence('negation'), `${r.from.join(' ')} → ${r.to.join(' ')}`, 'rule-card');
    }
  }

  // "Ich verstehe nicht die Frage" -> "Ich verstehe die Frage nicht"
  const ni = ow.indexOf('nicht');
  const nk = kw.indexOf('nicht');
  if (ni >= 0 && nk >= 0 && nk > ni && /^(der|die|das|den|dem|ein|eine|einen|mein|meine|meinen)$/.test(ow[ni + 1] ?? '') && (PUNCT.test(kw[nk + 1] ?? '.') || nk === kw.length - 1)) {
    add('negation', sentence('negation'), lang === 'de' ? '„nicht“ steht hinter dem Objekt.' : '“nicht” comes after the object.', 'rule-card');
  }

  // seit: the present tense and the dative plural ("seit drei Jahre" -> "seit drei Jahren")
  if (ow.includes('seit')) {
    const so = /\bseit (\S+) ([A-ZÄÖÜ][a-zäöü]+)/.exec(original);
    const sk = /\bseit (\S+) ([A-ZÄÖÜ][a-zäöü]+)/.exec(corrected);
    const plural = Boolean(so && sk && sk[2] === `${so[2]}n`);
    const tense = ow.some((w) => HABEN.has(w) || SEIN.has(w)) && ow.some((w) => /^ge[a-zäöüß]{3,}(t|en)$/.test(w)) && !kw.some((w) => /^ge[a-zäöüß]{3,}(t|en)$/.test(w));
    if (plural || tense) add('tense-seit', sentence('tense-seit'), lang === 'de' ? 'seit + Dativ, und was noch andauert, steht im Präsens.' : 'seit + dative, and what still continues is in the present tense.', 'rule-card');
  }

  // the verb bracket: a participle or infinitive moved to the end of the clause
  const MODAL = /^(kann|kannst|können|könnt|muss|musst|müssen|müsst|will|willst|wollen|wollt|darf|darfst|dürfen|dürft|soll|sollst|sollen|sollt|möchte|möchtest|möchten|werde|wirst|wird|werden|werdet)$/;
  const hasModal = kw.some((w) => MODAL.test(w));
  const closes = (w: string) =>
    /^ge[a-zäöüß]{3,}(t|en)$/.test(w) || Boolean(lex?.verb(w) && lex.verb(w)?.participle === w) || (hasModal && !MODAL.test(w) && Boolean(lex?.verb(w) && lex.verb(w)?.infinitive === w));
  const atEnd = (ws: string[], i: number) => i === ws.length - 1 || PUNCT.test(ws[i + 1] ?? '.');
  const movedToEnd = k.filter((w, i) => atEnd(k, i) && closes(w) && o.includes(w) && !atEnd(o, o.indexOf(w)));
  if (movedToEnd.length && !hits.some((h) => h.kind === 'verb-final')) {
    add('bracket', sentence('bracket'), lang === 'de' ? `${q(movedToEnd[0])} kommt ans Ende.` : `${q(movedToEnd[0])} moves to the end.`, 'rule-card');
  }
  return hits;
}

const FRONTED = /^(gestern|heute|morgen|dann|danach|jetzt|später|zuerst|abends|morgens|leider|vielleicht|deshalb|deswegen|trotzdem|außerdem|am \S+|im \S+|um \S+|in \S+ \S+|letzte\S* \S+|nächste\S* \S+|jeden \S+)\s+(ich|du|er|sie|es|wir|ihr|man)\s+\S+/i;
const SUBORDINATE = /\b(dass|weil|obwohl|wenn|ob|damit|bevor|nachdem|während|sobald|falls)\b/i;
const PREP_CASE = /\b(aus|bei|mit|nach|seit|von|zu|gegenüber|durch|für|gegen|ohne|um)\s+(der|die|das|den|dem|ein|eine|einen|einem|einer|mein\S*|dein\S*|sein\S*|ihr\S*|unser\S*|kein\S*)\b/i;
const PERFEKT = /\b(habe|hast|hat|haben|habt|bin|bist|ist|sind|seid)\b.*\bge[a-zäöüß]{3,}(t|en)\b/i;

/**
 * The rule note to attach when asking for a correction, read from the learner's sentence before the model
 * sees it. The grounding router looks for topic words ("Perfekt", "Dativ"), which a learner's sentence does
 * not contain; this picks the note for the mistake the sentence most likely has. Null: let the router decide.
 */
export function correctionNote(sentence: string): string | null {
  const s = sentence.trim();
  if (FRONTED.test(s) || SUBORDINATE.test(s)) return 'grammar-word-order';
  if (PREP_CASE.test(s)) return 'grammar-prepositions';
  if (PERFEKT.test(s)) return 'grammar-perfekt';
  return null;
}
