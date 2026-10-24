// Shows a tutor answer in the app language while the English streams in, line by line as the translator finishes.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { settleStreaming } from '@/harness/markdown';
import type { AppLang } from '@/i18n/languages';

import { readsEnglish } from './markdown';
import { translateAnswer, useTranslator } from './store';
import { translateLines } from './translate';

export type { TranslatedAnswer } from './translate';

interface Options {
  /** The language the text is in (the tutor's); only English is translated. */
  from: AppLang;
  /** The language to read it in: the app language. */
  to: AppLang;
  /** While streaming only the finished lines are translated; the last line shows as it arrives. */
  streaming?: boolean;
  /** False shows the source while keeping the translation at hand (the learner asked for the original). */
  enabled?: boolean;
}

export interface Translated {
  /** The text to show: the translation where it is ready, the source elsewhere (or when `enabled` is false). */
  text: string;
  /** True when any of `text` is translated. */
  translated: boolean;
  /** True when a translation exists for this text, shown or not: the "show the original" toggle is offered. */
  available: boolean;
  /** True when the translator failed on this text: the screen shows a retryable error, never raw English. */
  failed: boolean;
  /** Retries a failed translation. */
  retry: () => void;
}

/** The finished part of a streaming answer: every line but the one still being written. */
const head = (text: string, streaming: boolean | undefined) => (streaming ? text.split('\n').slice(0, -1).join('\n') : text);

export function useTranslated(text: string | undefined, { from, to, streaming, enabled = true }: Options): Translated {
  const ready = useTranslator((s) => s.status === 'ready' && s.lang === to);
  // the tutor was asked in English, but what it wrote has to read as English too
  const english = useMemo(() => Boolean(text) && from === 'en' && readsEnglish(text ?? ''), [text, from]);
  const active = ready && english && to !== 'en';
  const [done, setDone] = useState<{ source: string; text: string; available: boolean } | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  // bumps when the learner asks for another try after a failure
  const [attempt, setAttempt] = useState(0);

  const source = active && text ? head(text, streaming) : '';
  const failed = failedSource !== null && source.startsWith(failedSource);
  useEffect(() => {
    if (!source.trim() || failed) return;
    let cancelled = false;
    translateLines(settleStreaming(source), from, to, translateAnswer)
      .then((t) => {
        if (!cancelled) setDone({ source, text: t.text, available: t.available });
      })
      .catch(() => {
        if (!cancelled) setFailedSource(source);
      });
    return () => {
      cancelled = true;
    };
  }, [source, from, to, failed, attempt]);

  const retry = useCallback(() => {
    setFailedSource(null);
    setAttempt((n) => n + 1);
  }, []);

  const plain: Translated = { text: text ?? '', translated: false, available: false, failed, retry };
  if (!active || !text || !done || !text.startsWith(done.source)) return plain;
  if (!enabled || !done.available) return { ...plain, available: done.available };
  // the translation is of a head of the text; what came after it is still English
  return { ...plain, text: done.text + text.slice(done.source.length), translated: true, available: done.available };
}
