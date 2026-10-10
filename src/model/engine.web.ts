// The web build: no llama.rn, so there is no model. Same exports as engine.ts; everything answers "not here".

import type { Generate } from '@/harness/tutor';

export interface EngineInfo {
  name: string;
  version: string | null;
  gpu: boolean;
  reasonNoGPU: string;
  templateKnown: boolean;
  nCtx: number;
}

export interface EngineStats {
  requests: number;
  generatedTokens: number;
  lastTokS: number | null;
  avgTokS: number | null;
  promptTokens: number;
  promptMs: number;
  lastPromptTokens: number | null;
  lastCachedTokens: number | null;
  lastPromptMs: number | null;
  lastPpTokS: number | null;
  avgPpTokS: number | null;
  primes: number;
}

export class ModelError extends Error {
  constructor(
    message: string,
    readonly kind: 'not_loaded' | 'failed' | 'memory',
  ) {
    super(message);
    this.name = 'ModelError';
  }
}

// the runtime shows the catalog's web message for status 'unavailable'; these are the fallbacks behind it
const WEB_MESSAGE = 'The tutor model runs on a phone.';

const generate: Generate = () => Promise.reject(new ModelError(WEB_MESSAGE, 'not_loaded'));

export const engine: {
  readonly loaded: boolean;
  readonly stats: EngineStats;
  load(uri: string, onProgress?: (p: number) => void): Promise<EngineInfo>;
  unload(): Promise<void>;
  generate: Generate;
  prime(prompt: string, priority?: 'foreground' | 'background'): Promise<void>;
  setHomePrefix(prefix: (() => string) | null): void;
  yieldBackground(): void;
} = {
  loaded: false,
  get stats(): EngineStats {
    return {
      requests: 0,
      generatedTokens: 0,
      lastTokS: null,
      avgTokS: null,
      promptTokens: 0,
      promptMs: 0,
      lastPromptTokens: null,
      lastCachedTokens: null,
      lastPromptMs: null,
      lastPpTokS: null,
      avgPpTokS: null,
      primes: 0,
    };
  },
  load: () => Promise.reject(new ModelError(WEB_MESSAGE, 'failed')),
  unload: () => Promise.resolve(),
  generate,
  prime: () => Promise.resolve(),
  setHomePrefix: () => undefined,
  yieldBackground: () => undefined,
};

export async function inspectModelFile(_uri: string): Promise<{ name: string; version: string | null } | null> {
  return null;
}
