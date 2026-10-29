// Fix-it tips for the words the recognizer did not catch (src/harness/speaking.ts): the spelling of a missed
// word points at the German sounds learners of most first languages get wrong - ü and ö, the two ch sounds,
// z as ts, w as v, v as f, ei and ie, the final -ig, the devoiced final b/d/g, the throat r - and each tip says
// how to make the sound, with the learner's own missed words as the examples. A miss is not proof of a wrong
// sound (the recognizer mishears too), so the screens say so; the tips are what to check, not a verdict.

export type PronunciationRule =
  | 'ue'
  | 'oe'
  | 'ae'
  | 'ach'
  | 'ich'
  | 'ig'
  | 'z'
  | 'w'
  | 'v'
  | 'ei'
  | 'ie'
  | 'eu'
  | 'sch'
  | 'stsp'
  | 's'
  | 'final'
  | 'h'
  | 'r'
  | 'sz'
  | 'pf'
  | 'qu'
  | 'j'
  | 'ng'
  | 'tion'
  | 'long';

export interface PronunciationTip {
  rule: PronunciationRule;
  /** The learner's missed words the rule fired on, as written in the sentence. */
  words: string[];
}

const strip = (w: string) => w.replace(/^[„“"'(«»]+|[“”"'.,;:!?)«»…]+$/g, '');

/** The rules in the order they are worth mentioning: the rarer, more German sounds first. */
const RULES: [PronunciationRule, (w: string) => boolean][] = [
  ['ue', (w) => /ü/.test(w)],
  ['oe', (w) => /ö/.test(w)],
  ['ach', (w) => /(?:a|o|u|au)ch(?!s[^e])/.test(w)],
  ['ich', (w) => /(?:[eiäöüy]|[lnr])ch/.test(w) || /chen$/.test(w)],
  ['ig', (w) => /ig(?:e[rsn]?|st|t)?$/.test(w) && !/ig[e]$/.test(w) && /ig$/.test(w)],
  ['z', (w) => /t?z/.test(w) && !/sch/.test(w.replace(/t?z/g, ''))],
  ['stsp', (w) => /^(?:ge|be|ver|zer|ent|er|an|auf|aus|ab|vor|zu|mit|nach|über|unter|um|ein)?(?:st|sp)[aeiouäöüry]/.test(w)],
  ['sch', (w) => /sch/.test(w)],
  ['ei', (w) => /(?:ei|ai)/.test(w)],
  ['ie', (w) => /ie(?![aeou])/.test(w)],
  ['eu', (w) => /(?:eu|äu)/.test(w)],
  ['ae', (w) => /ä(?!u)/.test(w)],
  ['v', (w) => /^v|[^aeiouäöü]v/.test(w)],
  ['w', (w) => /w/.test(w)],
  ['qu', (w) => /qu/.test(w)],
  ['pf', (w) => /pf/.test(w)],
  ['j', (w) => /^j/.test(w)],
  ['sz', (w) => /ß/.test(w)],
  ['tion', (w) => /tion/.test(w)],
  ['ng', (w) => /ng/.test(w)],
  ['final', (w) => /[bdg]$/.test(w) && w.length > 2],
  ['h', (w) => /[aeiouäöü]h(?:$|[^aeiouäöü])/.test(w)],
  ['s', (w) => /^s[aeiouäöü]/.test(w)],
  ['r', (w) => /r/.test(w)],
  ['long', (w) => w.length >= 12],
];

/**
 * The tips for a list of missed words: each word adds the first two rules that fire on it, the tips are ordered
 * by how many words share them, and at most `max` are returned.
 */
export function pronunciationTips(missed: string[], max = 3): PronunciationTip[] {
  const hits = new Map<PronunciationRule, string[]>();
  for (const raw of missed) {
    const word = strip(raw);
    if (!word || /^\d+$/.test(word)) continue;
    const lower = word.toLowerCase();
    const add = (rule: PronunciationRule) => {
      const list = hits.get(rule) ?? [];
      if (!list.includes(word)) list.push(word);
      hits.set(rule, list);
    };
    let fired = 0;
    for (const [rule, test] of RULES) {
      if (rule === 'long' || !test(lower)) continue;
      add(rule);
      fired += 1;
      if (fired >= 2) break;
    }
    // a long word earns its tip on top of its sounds
    if (lower.length >= 12) add('long');
  }
  const order = RULES.map(([rule]) => rule);
  return [...hits.entries()]
    .sort((a, b) => b[1].length - a[1].length || order.indexOf(a[0]) - order.indexOf(b[0]))
    .slice(0, max)
    .map(([rule, words]) => ({ rule, words: words.slice(0, 3) }));
}
