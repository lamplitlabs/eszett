// What the app checked about one model answer. The tutor is a 3B model: it can be confidently wrong, so
// every answer is checked against what is known for sure and the result is shown with the answer:
//   - the verified lexicon (gender, plural, verb forms the answer cites),
//   - the rule engines (a number, time, date or price the learner asked about),
//   - the rule note the answer was grounded with (its "Reference" quote must match the note).

import { matchesAny } from './engines';
import type { GroundingPack } from './grounding';
import { checkText, type LexiconIndex, type LexReport } from './lexicon';
import { checkReferenceQuotes, type QuotedLine } from './parse';
import type { FactAnswer } from './route';
import { getLanguage, tIn } from '../i18n';
import type { AppLang } from '../i18n/languages';

export interface AnswerChecks {
  lexicon: LexReport | null;
  quotes: QuotedLine[];
  engine: { fact: FactAnswer; agrees: boolean } | null;
  /** Rule notes the prompt carried (keys of grounding.json). */
  grounded: string[];
}

export interface VerifyInput {
  lex: LexiconIndex | null;
  grounding: GroundingPack | null;
  grounded: string[];
  fact?: FactAnswer | null;
  /** The learner's own text, which a correction quotes and which is not the tutor's claim. */
  ignore?: string[];
}

export function verifyAnswer(answer: string, input: VerifyInput): AnswerChecks {
  const lexicon = input.lex?.full ? checkText(answer, input.lex, input.ignore ?? []) : null;
  const note = input.grounding && input.grounded[0] ? input.grounding.blocks[input.grounded[0]] ?? null : null;
  const quotes = checkReferenceQuotes(answer, note);
  const engine = input.fact ? { fact: input.fact, agrees: matchesAny(answer, input.fact.accepted) } : null;
  return { lexicon, quotes, engine, grounded: input.grounded };
}

export type CheckTone = 'ok' | 'warn' | 'info';

export interface CheckLine {
  tone: CheckTone;
  title: string;
  detail?: string;
}

/** The checks as short lines for the answer's footer and its detail sheet. */
export function describeChecks(c: AnswerChecks, noteTitle: (key: string) => string, lang: AppLang = getLanguage()): CheckLine[] {
  const t = (key: string, vars?: Record<string, string | number>) => tIn(lang, key, vars);
  const lines: CheckLine[] = [];
  if (c.engine) {
    lines.push(
      c.engine.agrees
        ? { tone: 'ok', title: t('check.engineMatches', { answer: c.engine.fact.answer }) }
        : { tone: 'warn', title: t('check.engineSays', { answer: c.engine.fact.answer }), detail: t('check.engineSaysDetail') },
    );
  }
  if (c.lexicon) {
    for (const f of c.lexicon.findings) lines.push({ tone: 'warn', title: t('check.lexicon', { expected: f.expected }), detail: t('check.lexiconDetail', { claimed: f.claimed, note: f.note }) });
    if (c.lexicon.verified.length) {
      const nouns = c.lexicon.verified.map((v) => `${v.article} ${v.noun}`);
      lines.push({
        tone: 'ok',
        title: t('check.nounsMatch', { count: nouns.length }),
        detail: nouns.join(', '),
      });
    }
  }
  const misquoted = c.quotes.filter((q) => q.source && !q.exact).length;
  if (c.quotes.length) {
    lines.push(
      misquoted
        ? { tone: 'ok', title: t('check.quotesRestored'), detail: t('check.quotesRestoredDetail', { count: misquoted }) }
        : { tone: 'ok', title: t('check.quotesExact') },
    );
  }
  for (const key of c.grounded) lines.push({ tone: 'info', title: t('check.ruleNote', { title: noteTitle(key) }), detail: t('check.ruleNoteDetail') });
  return lines;
}

/** Number of problems the learner should know about (drives the footer's colour). Repaired quotes are not
 *  problems any more: the learner already reads the note's own words. */
export const issueCount = (c: AnswerChecks) => (c.lexicon?.findings.length ?? 0) + (c.engine && !c.engine.agrees ? 1 : 0);
