// The tutor model's life on the phone and the one Tutor instance the whole app uses. The model is a GGUF file in
// Documents/models: downloaded here from our storage (started by itself on first open, pausable, resumed across
// launches, checked for size at the end), dropped in via the Files app, or picked with the system picker (only
// files whose header names the tutor); once a file is there the engine loads it and the status goes 'ready'.
// While the learner's access is locked (the free week is over and nothing was bought, see src/features/access.ts)
// the file stays on the phone but is not loaded: the status is 'locked' until setLocked(false) lets it in.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DownloadPauseState, DownloadTask, File } from 'expo-file-system';
import { Platform } from 'react-native';
import { create } from 'zustand';

import grammarCards from '@/data/grammar.json';
import grounding from '@/data/grounding.json';
import lexiconCore from '@/data/lexicon-core.json';
import type { GroundingPack } from '@/harness/grounding';
import { LexiconIndex, type LexiconData } from '@/harness/lexicon';
import { Tutor, type GrammarCard } from '@/harness/tutor';
import { t } from '@/i18n';
import { useSettings } from '@/state/settings';

import { engine, inspectModelFile, ModelError, type EngineInfo, type EngineStats } from './engine';
import {
  createModelDownload,
  deleteLocalModel,
  downloadLexicon,
  finalFile,
  findLocalModels,
  freeBytes,
  importModel,
  installedModel,
  partFile,
  pickModelFile,
  readLexicon,
  removeRetiredFiles,
  restoreModelDownload,
  type LocalModel,
} from './files';
import { describeBytes, EDITIONS, editionInfo, estimatedBytes, isEdition, isOurModel, modelUrl, SYSTEM_PROMPT, type Edition } from './manifest';

export const coreLexicon = new LexiconIndex(lexiconCore as unknown as LexiconData);
export const cards = grammarCards as unknown as GrammarCard[];
export const groundingPack = grounding as unknown as GroundingPack;

export const tutor = new Tutor({
  generate: engine.generate,
  prime: (prompt) => engine.prime(prompt),
  onPrimeError: (e) => logPrimeFailure('typing ahead', e),
  systemPrompt: SYSTEM_PROMPT,
  grounding: groundingPack,
  lex: coreLexicon,
  cards,
});

// Every prompt begins with the system prompt in the chat template: the engine evaluates it right after the
// model loads and keeps it in the cache, so a question only brings its own tokens.
engine.setHomePrefix(() => tutor.prefixText());

// The rule note goes before the question: then it is a prefix the engine can evaluate while the learner is
// still typing (Tutor.prepare), and the question itself is all that is left to process when it is sent. On
// the phone that is the difference between ~25 s and ~2 s to the first word of a grounded answer (self-test
// group K measures both layouts). The model was trained note-after and handles both; 'after' stays available
// for a comparison.
tutor.setLayout('before');

export type ModelStatus = 'checking' | 'absent' | 'downloading' | 'paused' | 'loading' | 'ready' | 'error' | 'unavailable' | 'locked';
/** Kept for src/ui/Lamp.tsx. */
export type Connection = ModelStatus;

export interface ModelState {
  status: ModelStatus;
  /** 0..1 while downloading or loading. */
  progress: number;
  bytes: number;
  /** Download size in bytes; -1 while unknown. */
  total: number;
  /** One human line about the current state. */
  detail: string;
  error: string | null;
  /** The edition in use or being downloaded. */
  edition: Edition;
  info: EngineInfo | null;
  stats: EngineStats;
  /** GGUF files found on the phone. */
  local: LocalModel[];
  /** Files of a previous model that this start deleted (an update to a new student), for the Your-tutor sheet. */
  removed: string[];
  /** True once the full lexicon (88k nouns) is loaded, so model answers are checked against all of it. */
  checking: boolean;
  boot: () => Promise<void>;
  download: (edition?: Edition) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  cancel: () => Promise<void>;
  useLocal: (m: LocalModel) => Promise<void>;
  /** Reloads the chosen model file, surfacing a failed GGUF load to the caller (the error screen can retry). */
  reload: (uri: string, edition?: Edition) => Promise<void>;
  importFile: () => Promise<void>;
  remove: () => Promise<void>;
  rescan: () => void;
  refreshStats: () => void;
  /** Locks the tutor out of memory (the file stays) or lets it back in; src/features/accessBind.ts calls this. */
  setLocked: (on: boolean) => Promise<void>;
}

const DOWNLOAD_KEY = 'eszett.download';
const HEADROOM_BYTES = 500_000_000;
const PROGRESS_EVERY_MS = 250;

interface SavedDownload {
  edition: Edition;
  state: DownloadPauseState;
}

// the one-line detail per status, as catalog keys resolved when the status is set (so they follow the app language)
const DETAIL_KEY: Record<Exclude<ModelStatus, 'downloading' | 'paused' | 'error'>, string> = {
  checking: 'model.detailChecking',
  absent: 'model.detailAbsent',
  loading: 'model.detailLoading',
  ready: 'model.detailReady',
  unavailable: 'model.errWeb',
  locked: 'model.detailLocked',
};
const detailOf = (status: keyof typeof DETAIL_KEY) => t(DETAIL_KEY[status]);

const web = Platform.OS === 'web';
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const basename = (uri: string) => uri.split('/').pop() ?? uri;

// The one download, outside the store: a DownloadTask is not state to render.
let task: DownloadTask | null = null;
let taskEdition: Edition | null = null;
let bootPromise: Promise<void> | null = null;
let lexiconLoad: Promise<void> | null = null;
let loadSeq = 0;
let loading: Promise<void> = Promise.resolve();
// The access lock (src/features/access.ts) and the file load() was last asked for, so the lock can let it back in.
let locked = false;
let current: { uri: string; edition: Edition } | null = null;

async function readSaved(): Promise<SavedDownload | null> {
  try {
    const raw = await AsyncStorage.getItem(DOWNLOAD_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedDownload>;
    const state = saved.state;
    if (!isEdition(saved.edition) || !state || typeof state.url !== 'string' || typeof state.resumeData !== 'string') return null;
    // a download of another file (the previous student's, before an app update) cannot be resumed into this one
    if (basename(state.url.split(/[?#]/)[0]) !== editionInfo(saved.edition).file) return null;
    return { edition: saved.edition, state };
  } catch (e) {
    // A corrupt record would silently look like "no download to resume"; keep the reason in the log.
    console.warn('[model] saved download state unreadable, ignoring it:', e);
    return null;
  }
}

const writeSaved = (saved: SavedDownload) =>
  AsyncStorage.setItem(DOWNLOAD_KEY, JSON.stringify(saved)).catch((e: unknown) => {
    console.warn('[model] could not persist download state; this download will not resume after a restart:', e);
  });
const clearSaved = () =>
  AsyncStorage.removeItem(DOWNLOAD_KEY).catch((e: unknown) => {
    console.warn('[model] could not clear the saved download state:', e);
  });

function deletePart(edition: Edition) {
  try {
    const part = partFile(edition);
    if (part.exists) part.delete();
  } catch {
    // nothing to remove
  }
}

function deleteFile(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // already gone
  }
}

/** What a GGUF calls itself (general.name); null when the header cannot be read. */
async function modelName(uri: string): Promise<string | null> {
  try {
    return (await inspectModelFile(uri))?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Loads the full lexicon in the background. A failure used to vanish without a trace: the app would stay on the
 * small core lexicon (checking stays false) forever. Log the reason and clear lexiconLoad so the next load retries.
 */
async function loadFullLexicon() {
  lexiconLoad ??= (async () => {
    let data = await readLexicon();
    if (!data) {
      await downloadLexicon();
      data = await readLexicon();
    }
    if (!data) throw new Error(t('model.errLexicon'));
    tutor.setLexicon(new LexiconIndex(data));
    useModel.setState({ checking: true });
  })().catch((e: unknown) => {
    lexiconLoad = null;
    console.warn('[model] full lexicon failed to load; answers are checked against the core lexicon:', e);
  });
  return lexiconLoad;
}

/** Loads a model file; a later call supersedes an earlier one (the engine keeps one model). */
function load(uri: string, edition: Edition): Promise<void> {
  const seq = ++loadSeq;
  current = { uri, edition };
  const run = loading.then(async (): Promise<void> => {
    if (seq !== loadSeq) return;
    if (locked) {
      // the week is over and nothing was bought: the file waits on the phone, out of memory, until setLocked(false)
      useModel.setState({ status: 'locked', progress: 0, detail: detailOf('locked'), error: null, info: null, edition });
      return;
    }
    useModel.setState({ status: 'loading', progress: 0, detail: detailOf('loading'), error: null, info: null, edition });
    try {
      let shown = -1;
      const info = await engine.load(uri, (p) => {
        const pct = Math.floor(p * 100);
        if (seq !== loadSeq || pct === shown) return;
        shown = pct;
        useModel.setState({ progress: p, detail: p >= 1 ? t('model.detailWarming') : detailOf('loading') });
      });
      if (seq !== loadSeq) return;
      useModel.setState({ status: 'ready', progress: 1, detail: detailOf('ready'), info, stats: engine.stats, error: null });
      void loadFullLexicon();
    } catch (e) {
      if (seq !== loadSeq) return;
      // A failed GGUF load (a truncated file, a format llama.cpp rejects, not enough memory for the context)
      // must be diagnosable: keep the reason in the log with the file it came from, and hand the caller a
      // retryable failure it can await instead of a run that resolves while the store says 'error'.
      console.warn(`[model] loading ${basename(uri)} failed:`, e);
      const text = describeError(e);
      useModel.setState({ status: 'error', progress: 0, detail: text, error: text, info: null });
      throw e instanceof ModelError ? e : new ModelError(message(e), 'failed');
    }
  });
  loading = run.catch(() => undefined);
  return run;
}

function downloadDetail(bytes: number, total: number): string {
  return total > 0
    ? t('model.detailDownloadingOf', { done: describeBytes(bytes), total: describeBytes(total) })
    : t('model.detailDownloading', { done: describeBytes(bytes) });
}

/** Runs a download task to its end: a complete file (then load it), a pause (then remember it) or a failure. */
async function runTask(dl: DownloadTask, edition: Edition, how: 'start' | 'resume') {
  task = dl;
  taskEdition = edition;
  const { bytes, total } = useModel.getState();
  useModel.setState({ status: 'downloading', edition, error: null, detail: downloadDetail(bytes, total) });
  let file: File | null;
  try {
    file = how === 'start' ? await dl.downloadAsync() : await dl.resumeAsync();
  } catch (e) {
    if (task !== dl) return; // cancelled or replaced: whoever did it set the state
    task = null;
    taskEdition = null;
    await clearSaved();
    deletePart(edition);
    if (how === 'resume' && /resume data/i.test(message(e))) {
      // paused before any data had arrived: there is nothing to resume from, so start over
      await useModel.getState().download(edition);
      return;
    }
    const text = t('model.errDownloadFailed', { reason: message(e) });
    useModel.setState({ status: 'error', detail: text, error: text, progress: 0, bytes: 0, total: -1 });
    return;
  }
  if (task !== dl) return;

  if (!file) {
    // paused
    try {
      await writeSaved({ edition, state: dl.savable() });
    } catch {
      // paused before any data arrived: nothing to resume from later
      await clearSaved();
    }
    const s = useModel.getState();
    useModel.setState({
      status: 'paused',
      detail: s.total > 0 ? t('model.detailPausedOf', { done: describeBytes(s.bytes), total: describeBytes(s.total) }) : t('model.detailPaused', { done: describeBytes(s.bytes) }),
    });
    return;
  }

  task = null;
  taskEdition = null;
  dl.release();
  await clearSaved();
  try {
    const final = finalFile(edition);
    if (final.exists) final.delete();
    try {
      file.rename(final.name);
    } catch {
      await file.move(final, { overwrite: true });
    }
    // A short file is not a model: a captive portal's page, a connection that ended early, a different file at a custom source.
    const expected = editionInfo(edition).bytes;
    const actual = final.size;
    if (typeof expected === 'number' && actual !== expected) {
      deleteFile(final);
      const text = t('model.errIncomplete', { done: describeBytes(actual), total: describeBytes(expected) });
      useModel.setState({ status: 'error', detail: text, error: text, progress: 0, bytes: 0, total: -1, local: findLocalModels() });
      return;
    }
    useModel.setState({ progress: 1, bytes: actual, total: actual, detail: t('model.detailDownloaded'), local: findLocalModels() });
    await load(final.uri, edition);
  } catch (e) {
    const text = t('model.errSaveFailed', { reason: message(e) });
    useModel.setState({ status: 'error', detail: text, error: text });
  }
}

/** Store updates for download progress, at most a few times a second. */
function progressSink(edition: Edition) {
  let latest: { bytes: number; total: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    if (!latest || taskEdition !== edition) return;
    const { bytes, total } = latest;
    const against = total > 0 ? total : estimatedBytes(edition);
    const progress = Math.max(0, Math.min(total > 0 ? 1 : 0.99, bytes / against));
    useModel.setState({ bytes, total, progress, detail: downloadDetail(bytes, total) });
  };
  return (bytes: number, total: number) => {
    latest = { bytes, total: total > 0 ? total : -1 };
    if (useModel.getState().status !== 'downloading') return;
    timer ??= setTimeout(flush, PROGRESS_EVERY_MS);
  };
}

/** The model file the learner chose, if it is still on the phone (matched by name too: iOS moves the app's folder). */
function chosenLocal(local: LocalModel[], modelFile: string): LocalModel | null {
  if (!modelFile) return null;
  return local.find((m) => m.uri === modelFile) ?? local.find((m) => m.name === basename(modelFile)) ?? null;
}

export const useModel = create<ModelState>()((set, get) => ({
  status: 'checking',
  progress: 0,
  bytes: 0,
  total: -1,
  detail: '',
  error: null,
  edition: useSettings.getState().edition,
  info: null,
  stats: engine.stats,
  local: [],
  removed: [],
  checking: false,

  boot: () => {
    bootPromise ??= (async () => {
      if (web) {
        set({ status: 'unavailable', detail: detailOf('unavailable') });
        return;
      }
      const settings = useSettings.getState();
      // After an update to a new student the previous one's files go first, so the phone never holds two models.
      const removed = removeRetiredFiles();
      if (settings.modelFile && removed.includes(basename(settings.modelFile))) settings.setModelFile('');
      const local = findLocalModels();
      set({ status: 'checking', detail: detailOf('checking'), local, removed, edition: settings.edition });

      const chosen = chosenLocal(local, settings.modelFile);
      const found = chosen ?? installedModel(settings.edition);
      if (found) {
        // already logged and in the store as 'error' when the load fails: the Your-tutor sheet shows it from there
        await load(found.uri, found.edition ?? settings.edition).catch(() => undefined);
        return;
      }

      const saved = await readSaved();
      if (!saved) await clearSaved();
      for (const { edition } of EDITIONS) {
        if (edition !== saved?.edition) deletePart(edition);
      }
      if (saved) {
        try {
          // the app's folder can move between installs: point the task at today's .part path
          const state = { ...saved.state, fileUri: partFile(saved.edition).uri };
          const restored = restoreModelDownload(state, progressSink(saved.edition));
          set({ edition: saved.edition, bytes: 0, total: -1, progress: 0 });
          await runTask(restored, saved.edition, 'resume');
          return;
        } catch (e) {
          // without the log this looks exactly like "the download never existed" on the next launch
          console.warn('[model] could not resume the saved download; starting without it:', e);
          await clearSaved();
          deletePart(saved.edition);
        }
      }
      if (useSettings.getState().autoDownload) {
        // nothing on the phone and the learner has not said no: fetch the edition without being asked
        await get().download(settings.edition);
        return;
      }
      set({ status: 'absent', detail: detailOf('absent'), progress: 0, bytes: 0, total: -1 });
    })();
    return bootPromise;
  },

  download: async (edition = get().edition) => {
    if (web) return;
    if (task && taskEdition === edition) {
      if (task.state === 'paused') return get().resume();
      return;
    }
    if (task) await get().cancel();

    const free = freeBytes();
    if (free >= 0 && free < estimatedBytes(edition) + HEADROOM_BYTES) {
      const text = t('model.errNoSpace', { size: describeBytes(estimatedBytes(edition)) });
      set({ status: 'error', edition, detail: text, error: text, progress: 0, bytes: 0, total: -1 });
      return;
    }

    useSettings.getState().setEdition(edition);
    useSettings.getState().setAutoDownload(true);
    useSettings.getState().setModelFile('');
    const installed = installedModel(edition);
    if (installed) {
      await load(installed.uri, edition).catch(() => undefined); // logged and in the store as 'error' by load()
      return;
    }

    loadSeq += 1;
    await engine.unload();
    set({ status: 'downloading', edition, info: null, error: null, progress: 0, bytes: 0, total: -1, detail: t('model.detailStarting') });
    deletePart(edition);
    try {
      const url = modelUrl(edition, useSettings.getState().modelSource);
      const t = createModelDownload(url, partFile(edition), progressSink(edition));
      await runTask(t, edition, 'start');
    } catch (e) {
      const text = t('model.errDownloadFailed', { reason: message(e) });
      set({ status: 'error', detail: text, error: text });
    }
  },

  pause: async () => {
    const dl = task;
    if (!dl || dl.state !== 'active') return;
    set({ detail: t('model.detailPausing') });
    try {
      await dl.pauseAsync();
    } catch {
      // the task ended on its own meanwhile; runTask has handled it
    }
  },

  resume: async () => {
    const dl = task;
    const edition = taskEdition;
    if (!dl || !edition || dl.state !== 'paused') return;
    await runTask(dl, edition, 'resume');
  },

  cancel: async () => {
    const dl = task;
    const edition = taskEdition;
    task = null;
    taskEdition = null;
    try {
      dl?.cancel();
    } catch {
      // already finished
    }
    // the learner said no: the next launch must not start the download again
    useSettings.getState().setAutoDownload(false);
    await clearSaved();
    if (edition) deletePart(edition);
    set({ status: 'absent', detail: detailOf('absent'), error: null, progress: 0, bytes: 0, total: -1, local: findLocalModels() });
  },

  useLocal: async (m) => {
    if (web) return;
    if (task) await get().cancel();
    const edition = m.edition ?? get().edition;
    set({ status: 'loading', progress: 0, detail: t('model.detailCheckingFile'), error: null });
    // Only the tutor: a file whose header names another model is refused; an unreadable header is given the benefit of the doubt.
    const name = await modelName(m.uri);
    if (name && !isOurModel(name)) {
      loadSeq += 1;
      await engine.unload();
      useSettings.getState().setModelFile('');
      const text = t('model.errNotTutor', { name });
      set({ status: 'error', detail: text, error: text, info: null, progress: 0, bytes: 0, total: -1, local: findLocalModels() });
      return;
    }
    useSettings.getState().setModelFile(m.uri);
    await load(m.uri, edition).catch(() => undefined); // logged and in the store as 'error' by load()
  },
  reload: async (uri, edition = get().edition) => {
    await load(uri, edition);
  },

  importFile: async () => {
    if (web) return;
    const picked = await pickModelFile();
    if (!picked) return;
    if (task) await get().cancel();
    loadSeq += 1;
    set({ status: 'loading', progress: 0, detail: t('model.detailCopying'), error: null });
    try {
      const m = await importModel(picked);
      set({ local: findLocalModels() });
      await get().useLocal(m);
    } catch (e) {
      const text = t('model.errCopyFailed', { reason: message(e) });
      set({ status: 'error', detail: text, error: text, local: findLocalModels() });
    }
  },

  remove: async () => {
    if (web) return;
    loadSeq += 1;
    current = null;
    await engine.unload();
    if (task) await get().cancel();
    const settings = useSettings.getState();
    const { edition, local } = get();
    const chosen = chosenLocal(local, settings.modelFile);
    try {
      if (chosen) deleteLocalModel(chosen);
      else {
        const file = finalFile(edition);
        if (file.exists) file.delete();
      }
    } catch (e) {
      // A delete that fails would silently leave the model on the phone; keep the reason in the log.
      console.warn('[model] could not delete the model file:', e);
    }
    deletePart(edition);
    settings.setModelFile('');
    // removed on purpose: the next launch must not fetch it again
    settings.setAutoDownload(false);
    set({ status: 'absent', detail: detailOf('absent'), error: null, info: null, progress: 0, bytes: 0, total: -1, local: findLocalModels() });
  },

  rescan: () => set({ local: findLocalModels() }),

  refreshStats: () => set({ stats: engine.stats }),

  setLocked: async (on) => {
    if (on === locked) return;
    locked = on;
    if (web) return;
    const { status } = get();
    if (on) {
      // a download or an error carries on as it is; load() will see the flag when the file is next asked for
      if (status !== 'ready' && status !== 'loading') return;
      loadSeq += 1;
      await engine.unload();
      set({ status: 'locked', progress: 0, detail: detailOf('locked'), error: null, info: null });
      return;
    }
    if (status !== 'locked') return;
    if (current) await load(current.uri, current.edition).catch(() => undefined); // logged and in the store as 'error' by load()
    else set({ status: 'absent', detail: detailOf('absent'), progress: 0, bytes: 0, total: -1, local: findLocalModels() });
  },
}));

export const isReady = () => useModel.getState().status === 'ready';

/**
 * Notes a cache-prime that failed. A failed prime is not fatal by itself - the reply is generated without the
 * warm cache - but it must not vanish silently: a model whose context dies on evaluation fails the reply the
 * same way right after, and the learner would see a tutor that simply never answers. The scope says where the
 * prime came from; the surface carrying the failure to the learner is the generate that follows it.
 */
export function logPrimeFailure(scope: string, error: unknown): void {
  console.warn(`[model] could not prime the prompt cache (${scope}):`, error);
}

/** Friendly description of a failed request, for inline errors. */
export function describeError(e: unknown): string {
  if (e instanceof ModelError) {
    if (e.kind === 'not_loaded') {
      const { status, progress } = useModel.getState();
      switch (status) {
        case 'absent':
          return t('model.errAbsent');
        case 'downloading':
          return t('model.errDownloading', { pct: Math.round(progress * 100) });
        case 'paused':
          return t('model.errPaused');
        case 'checking':
        case 'loading':
          return t('model.errLoading');
        case 'unavailable':
          return t('model.errWeb');
        case 'locked':
          return t('model.errLocked');
        default:
          return e.message;
      }
    }
    if (e.kind === 'memory') return t('model.errMemory');
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
