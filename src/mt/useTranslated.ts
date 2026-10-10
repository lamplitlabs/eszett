// Shows a tutor answer in the app language while the English streams in, line by line as the translator finishes.

import { useEffect, useMemo, useState } from 'react';

import { settleStreaming } from '@/harness/markdown';
import type { AppLang } from '@/i18n/languages';

import { readsEnglish } from './markdown';
import { translateAnswer, useTranslator } from './store';

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
}

/** The finished part of a streaming answer: every line but the one still being written. */
const head = (text: string, streaming: boolean | undefined) => (streaming ? text.split('\n').slice(0, -1).join('\n') : text);

export function useTranslated(text: string | undefined, { from, to, streaming, enabled = true }: Options): Translated {
  const ready = useTranslator((s) => s.status === 'ready' && s.lang === to);
  // the tutor was asked in English, but what it wrote has to read as English too
  const english = useMemo(() => Boolean(text) && from === 'en' && readsEnglish(text ?? ''), [text, from]);
  const active = ready && english && to !== 'en';
  const [done, setDone] = useState<{ source: string; text: string } | null>(null);

  const source = active && text ? head(text, streaming) : '';
  useEffect(() => {
    if (!source.trim()) return;
    let cancelled = false;
    translateAnswer(settleStreaming(source), from, to)
      .then((t) => {
        if (!cancelled) setDone({ source, text: t });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [source, from, to]);

  const plain = { text: text ?? '', translated: false, available: false };
  if (!active || !text || !done || !text.startsWith(done.source)) return plain;
  const available = done.text !== done.source;
  if (!enabled || !available) return { ...plain, available };
  // the translation is of a head of the text; what came after it is still English
  return { text: done.text + text.slice(done.source.length), translated: true, available };
}
