// German verb morphology shared by build-words.mjs (which writes src/data/words.json) and model-words.mjs
// (which asks the app's own model for words): the forms a regular verb takes, the forms an irregular verb's
// principal parts imply, and the prefixes that let a compound verb borrow the parts of its base verb.

/** Every form of sein, haben, werden, the modals and wissen, which no regular pattern produces. */
export const IRREGULAR_FULL = `
bin bist ist sind seid war warst waren wart gewesen sei seien seid wäre wärst wären wärt
habe hast hat haben habt hatte hattest hatten hattet gehabt hätte hättest hätten hättet
werde wirst wird werden werdet wurde wurdest wurden wurdet geworden worden würde würdest würden würdet
kann kannst können könnt konnte konntest konnten konntet gekonnt könnte könntest könnten könntet
muss musst müssen müsst musste musstest mussten musstet gemusst müsste müssten
will willst wollen wollt wollte wolltest wollten wolltet gewollt
soll sollst sollen sollt sollte solltest sollten solltet gesollt
darf darfst dürfen dürft durfte durftest durften durftet gedurft dürfte dürften
mag magst mögen mögt mochte mochtest mochten mochtet gemocht möchte möchtest möchten möchtet
weiß weißt wissen wisst wusste wusstest wussten wusstet gewusst wüsste wüssten
`
  .split(/\s+/)
  .filter(Boolean);

/**
 * Inseparable prefixes: the participle takes no ge- (bekommen, verstanden). über, unter, wieder, hinter and wider
 * can go either way; the everyday verbs (überlegen, unterschreiben, wiederholen) are inseparable, so they are read
 * so here, and the lexicon's own parts win for the verbs it lists.
 */
export const INSEPARABLE = /^(be|ge|emp|ent|er|ver|zer|miss|über|unter|wieder|hinter|wider)/;

/** Separable prefixes, longest first so "zurück" wins over "zu"; the participle keeps the ge- after them (aufgestanden). */
export const SEPARABLE = [
  'zurück', 'zusammen', 'vorbei', 'heraus', 'herein', 'herunter', 'herüber', 'hinaus', 'hinein', 'hinunter', 'hinüber', 'weiter', 'nieder',
  'entgegen', 'gegenüber', 'auseinander', 'fest', 'fort', 'statt', 'teil', 'heim', 'kennen', 'spazieren',
  'ab', 'an', 'auf', 'aus', 'bei', 'da', 'ein', 'her', 'hin', 'los', 'mit', 'nach', 'vor', 'weg', 'zu', 'um', 'durch',
];

/** Whether a string can open a German verb: a vowel, or a consonant cluster German words start with ("tworten" cannot, so antworten is no an-verb). */
export const legalOnset = (base) =>
  /^(?:[aeiouäöü]|(?:sch[lmnrw]?|s[cpt]r?|pf[lr]?|[bdfgkpt][lr]?|[hjlmnrvwz]|zw|kn|gn|qu|chr|thr|wr|dw|tsch|c)[aeiouäöüy])/.test(base);

/** The stem a verb's endings attach to: "arbeiten" → "arbeit", "lächeln" → "lächel", "tun" → "tu". */
export const stemOf = (infinitive) => infinitive.replace(/(e)?n$/, '');

/** Whether the stem asks for a linking -e- before -st, -t and -te (arbeitet, regnet, atmet, rechnet; but lernt, kommt, wohnt). */
export const linkingE = (stem) => /[td]$/.test(stem) || (/[^aeiouäöülrmn][mn]$/.test(stem) && !/[aeiouäöü]h[mn]$/.test(stem));

/** The lexicon writes separable verbs as "fängt an"; as a single form that is "anfängt". */
export function normaliseParts(v) {
  const join = (f) => {
    const m = /^(\S+) (\S+)$/.exec((f ?? '').replace(/\s*\bsich\b\s*/, ' ').trim());
    return m ? `${m[2]}${m[1]}` : (f ?? '').replace(/\s*\bsich\b\s*/, '').trim();
  };
  return { ...v, present_3sg: join(v.present_3sg), preterite: join(v.preterite), participle: join(v.participle) };
}

/**
 * The present tense, preterite and participle of a regular (weak) verb. `isBase` says whether a string is a verb
 * a separable prefix could be split from (defaults to a spelling heuristic; pass the known verbs where you have them).
 */
export function regularForms(infinitive, isBase = legalOnset) {
  const stem = stemOf(infinitive);
  const e = linkingE(stem) ? 'e' : '';
  const forms = [infinitive, `${stem}e`, `${stem}${e}st`, `${stem}${e}t`, `${stem}${e}te`, `${stem}${e}test`, `${stem}${e}ten`, `${stem}${e}tet`];
  // lächeln → ich lächle, wir lächeln; wandern → ich wandre, wir wandern
  if (/(el|er)n$/.test(infinitive)) forms.push(`${stem.slice(0, -2)}${stem.slice(-1)}e`, `${stem}n`);
  forms.push(regularParticiple(infinitive, isBase));
  return forms;
}

/** ge- + stem + t, except after an inseparable prefix or for -ieren verbs (bezahlt, studiert); separable prefixes keep it inside (aufgeräumt). */
export function regularParticiple(infinitive, isBase = legalOnset) {
  const stem = stemOf(infinitive);
  const e = linkingE(stem) ? 'e' : '';
  if (INSEPARABLE.test(infinitive) || /ieren$/.test(infinitive)) return `${stem}${e}t`;
  const prefix = separablePrefix(infinitive, isBase);
  if (prefix) return `${prefix}ge${stem.slice(prefix.length)}${e}t`;
  return `ge${stem}${e}t`;
}

/** The er/sie/es present tense of a regular verb. */
export function regularPresent(infinitive) {
  const stem = stemOf(infinitive);
  return `${stem}${linkingE(stem) ? 'e' : ''}t`;
}

/** The er/sie/es preterite of a regular verb. */
export function regularPreterite(infinitive) {
  const stem = stemOf(infinitive);
  return `${stem}${linkingE(stem) ? 'e' : ''}te`;
}

/**
 * The forms an irregular verb's principal parts imply: the infinitive persons, du/ihr from the er/sie/es present,
 * and the preterite persons. Konjunktiv II is not derived (käme, ginge) because it is not predictable from these.
 */
export function irregularForms(v) {
  const out = [v.infinitive, v.present_3sg, v.preterite, v.participle];
  const stem = stemOf(v.infinitive);
  out.push(`${stem}e`, `${stem}en`, `${stem}t`, `${stem}st`);
  if (/(el|er)n$/.test(v.infinitive)) out.push(`${stem}n`);
  const s = v.present_3sg;
  if (/st$/.test(s) || /[sßxz]t$/.test(s)) out.push(s);
  else if (/t$/.test(s)) out.push(`${s.slice(0, -1)}st`);
  else out.push(`${s}st`, `${s}t`);
  const p = v.preterite;
  if (/e$/.test(p)) out.push(`${p}st`, `${p}n`, `${p}t`);
  else if (/[dt]$/.test(p)) out.push(`${p}st`, `${p}est`, `${p}en`, `${p}et`); // du fandst/fandest, ihr fandet
  else if (/[sßxz]$/.test(p)) out.push(`${p}t`, `${p}est`, `${p}en`); // du aßt/aßest, ihr aßt
  else out.push(`${p}st`, `${p}en`, `${p}t`);
  return out;
}

/** The separable prefix an infinitive starts with, when the rest is a verb of at least four letters by `isBase` (aufstehen → "auf"; antworten → null). */
export function separablePrefix(infinitive, isBase = legalOnset) {
  for (const prefix of SEPARABLE) {
    const base = infinitive.slice(prefix.length);
    if (infinitive.startsWith(prefix) && base.length >= 4 && /(en|ern|eln)$/.test(infinitive) && isBase(base)) return prefix;
  }
  return null;
}

/**
 * Builds the principal parts of a compound verb from a known base verb: aufstehen from stehen (aufsteht, aufstand,
 * aufgestanden), verstehen from stehen (versteht, verstand, verstanden). `baseParts(base)` returns the base verb's
 * parts or null; the result is null when no prefix splits the verb into prefix + known base.
 */
export function composeParts(infinitive, baseParts) {
  const prefixes = [...SEPARABLE, 'be', 'ge', 'emp', 'ent', 'er', 'ver', 'zer', 'miss'];
  for (const prefix of prefixes) {
    if (!infinitive.startsWith(prefix)) continue;
    const base = infinitive.slice(prefix.length);
    if (base.length < 4) continue;
    const parts = baseParts(base);
    if (!parts) continue;
    const separable = SEPARABLE.includes(prefix);
    const participle = separable ? `${prefix}${parts.participle}` : `${prefix}${parts.participle.replace(/^ge/, '')}`;
    return { infinitive, present_3sg: `${prefix}${parts.present_3sg}`, preterite: `${prefix}${parts.preterite}`, participle, composed: true };
  }
  return null;
}

/** Whether principal parts are those a regular verb would have. */
export function isRegularParts(infinitive, parts, isBase = legalOnset) {
  return parts.present_3sg === regularPresent(infinitive) && parts.preterite === regularPreterite(infinitive) && parts.participle === regularParticiple(infinitive, isBase);
}
