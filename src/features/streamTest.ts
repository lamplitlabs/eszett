// A short streamed answer, timed: proves the whole path from the prompt to the model running on this phone.

import { useCallback, useState } from 'react';

import { DEFAULT_SYSTEM_PROMPT } from '@/harness/prompts';
import { engine } from '@/model/engine';
import { describeError } from '@/model/runtime';

export interface StreamTestResult {
  status: 'running' | 'done' | 'error';
  text: string;
  pieces: number;
  firstMs: number | null;
  totalMs: number | null;
  error?: string;
}

export function useStreamTest() {
  const [result, setResult] = useState<StreamTestResult | null>(null);
  const run = useCallback(() => {
    const t0 = Date.now();
    let first: number | null = null;
    let pieces = 0;
    setResult({ status: 'running', text: '', pieces: 0, firstMs: null, totalMs: null });
    engine
      .generate(
        [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: 'Wie sagt man „good morning“ auf Deutsch? Nur die Übersetzung.' },
        ],
        {
          maxNewTokens: 16,
          onText: (text) => {
            first ??= Date.now() - t0;
            pieces += 1;
            setResult({ status: 'running', text, pieces, firstMs: first, totalMs: null });
          },
        },
      )
      .then((r) => setResult({ status: 'done', text: r.text, pieces, firstMs: first, totalMs: Date.now() - t0 }))
      .catch((e) => setResult({ status: 'error', text: '', pieces, firstMs: first, totalMs: Date.now() - t0, error: describeError(e) }));
  }, []);
  return [result, run] as const;
}
