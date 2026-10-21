import { beforeEach, describe, expect, it, vi } from 'vitest';

// Native modules are mocked so the store module loads under node: a failed GGUF load must surface as a
// retryable, logged error, and a failed prompt prime must be logged instead of ending a reply silently.
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});
vi.mock('expo-file-system', () => {
  class FakeFile {
    name = '';
    size = 0;
    exists = true;
    uri = '';
  }
  class FakeDir {
    exists = false;
    create() {}
    list() {
      return [];
    }
  }
  return { Directory: FakeDir, File: FakeFile, Paths: { document: '/tmp' }, DownloadTask: class {} };
});
vi.mock('llama.rn', () => ({
  initLlama: vi.fn(),
  loadLlamaModelInfo: vi.fn(async () => ({})),
}));

import * as engineMod from '@/model/engine';
import { engine, ModelError } from '@/model/engine';
import { logPrimeFailure, useModel } from '@/model/runtime';
import { Tutor } from '@/harness/tutor';

describe('runtime model failure visibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('surfaces a failed GGUF load: logged, stored as error, and thrown to the caller', async () => {
    const boom = new ModelError('llama.cpp could not allocate the context', 'failed');
    vi.spyOn(engineMod, 'inspectModelFile').mockResolvedValue({ name: 'light-german-tutor-phone-v25' } as never);
    vi.spyOn(engine, 'load').mockRejectedValue(boom);
    Object.defineProperty(engine, 'stats', { get: () => null, configurable: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const uri = 'file:///tmp/light-german-tutor-phone-v25-Q5_K_M.gguf';
    await expect(useModel.getState().reload(uri)).rejects.toBe(boom);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('light-german-tutor-phone-v25-Q5_K_M.gguf'), boom);
    expect(useModel.getState().status).toBe('error');
    expect(useModel.getState().error).toContain('llama.cpp could not allocate the context');
  });

  it('logPrimeFailure logs the failure with its scope', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const boom = new Error('context is dead');
    logPrimeFailure('typing ahead', boom);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('typing ahead'), boom);
  });

  it('a failed prompt prime reaches onPrimeError and never rejects prepare()', async () => {
    const boom = new Error('prime blew up');
    const onPrimeError = vi.fn();
    const t = new Tutor({
      generate: async () => ({ text: 'ok' }),
      prime: async () => {
        throw boom;
      },
      onPrimeError,
      systemPrompt: 'sys',
    } as never);
    await expect(t.prepare('Wie sagt man das?', { level: 'A1', lang: 'en' } as never, 'ask')).resolves.toBeUndefined();
    expect(onPrimeError).toHaveBeenCalledWith(boom);
  });

  it('a working prime resolves prepare() without an error report', async () => {
    const onPrimeError = vi.fn();
    let primed = '';
    const t = new Tutor({
      generate: async () => ({ text: 'ok' }),
      prime: async (prompt: string) => {
        primed = prompt;
      },
      onPrimeError,
      systemPrompt: 'sys',
    } as never);
    await t.prepare('Wie sagt man das?', { level: 'A1', lang: 'en' } as never, 'ask');
    expect(onPrimeError).not.toHaveBeenCalled();
    expect(typeof primed).toBe('string');
  });
});
