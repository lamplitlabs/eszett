// The model files on the phone: the GGUF editions the app downloads into Documents/models, GGUF files the
// learner drops into Documents (Files app, Finder) or picks with the system picker, and the full lexicon.
// Every synchronous File/Directory property can throw (a path that vanished, a permission the OS withdrew),
// so the scans here answer with [] or null instead of taking the app down. React Native only: on the web the
// runtime reports the model as unavailable before anything here runs.

import { Directory, DownloadTask, File, Paths, type DownloadPauseState } from 'expo-file-system';
import { Platform } from 'react-native';

import type { LexiconData } from '@/harness/lexicon';
import { editionInfo, editionOfName, isGgufName, isRetiredModelName, LEXICON_FALLBACK_URL, LEXICON_URL, REVISION, type Edition } from '@/model/manifest';

export interface LocalModel {
  uri: string;
  name: string;
  bytes: number;
  /** The edition named in the file name; null for a GGUF the app does not recognise. */
  edition: Edition | null;
  where: 'models' | 'documents';
}

const native = Platform.OS !== 'web';

/** A File/Directory handle, or null when the file system is not there (web, a native module that failed to load). */
function handle<T>(make: () => T): T {
  if (!native) return null as unknown as T;
  try {
    return make();
  } catch {
    return null as unknown as T;
  }
}

/** Documents/models: downloaded and imported model files, plus the lexicon. Created on demand. */
export const modelsDir: Directory = handle(() => new Directory(Paths.document, 'models'));

/** The full lexicon (88k nouns) for the current model revision, fetched once from the Hub. */
export const lexiconFile: File = handle(() => new File(modelsDir, `lexicon-${REVISION}.json`));

function ensureModelsDir(): Directory {
  if (!modelsDir.exists) modelsDir.create({ intermediates: true, idempotent: true });
  return modelsDir;
}

function describe(file: File, where: LocalModel['where']): LocalModel | null {
  try {
    const name = file.name;
    if (!isGgufName(name)) return null; // also skips "<file>.gguf.part"
    return { uri: file.uri, name, bytes: file.size, edition: editionOfName(name), where };
  } catch {
    return null;
  }
}

function scan(dir: Directory, where: LocalModel['where']): LocalModel[] {
  try {
    if (!dir.exists) return [];
    const found: LocalModel[] = [];
    for (const item of dir.list()) {
      if (!(item instanceof File)) continue;
      const model = describe(item, where);
      if (model) found.push(model);
    }
    return found.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Every *.gguf on the phone: in models/ (downloaded or imported) and in Documents (sideloaded). Never throws. */
export function findLocalModels(): LocalModel[] {
  if (!native) return [];
  return [...scan(modelsDir, 'models'), ...scan(Paths.document, 'documents')];
}

/**
 * Removes from models/ what an earlier version of the app left behind: exports of other students, complete or
 * still .part, and lexicons of other revisions. With `keepComplete` the complete files of other students stay -
 * the previous model keeps working until the new one is on the phone (src/model/update.ts) - and only their
 * half-downloaded .part files and stale lexicons go. Files the learner dropped into Documents are not touched.
 * Returns the names removed; never throws.
 */
export function removeRetiredFiles(keepComplete = false): string[] {
  const removed: string[] = [];
  if (!native) return removed;
  try {
    if (!modelsDir.exists) return removed;
    for (const item of modelsDir.list()) {
      if (!(item instanceof File)) continue;
      const name = item.name;
      const staleLexicon = /^lexicon-.+\.json$/i.test(name) && name !== lexiconFile.name;
      if (!isRetiredModelName(name) && !staleLexicon) continue;
      if (keepComplete && isRetiredModelName(name) && !/\.part$/i.test(name)) continue;
      try {
        item.delete();
        removed.push(name);
      } catch {
        // in use or already gone: try again next start
      }
    }
  } catch {
    // the folder cannot be read: nothing to clean
  }
  return removed;
}

/** The bytes of other students' complete models in models/: what retiring them would free. */
export function retiredBytes(): number {
  if (!native) return 0;
  try {
    if (!modelsDir.exists) return 0;
    let total = 0;
    for (const item of modelsDir.list()) {
      if (item instanceof File && isRetiredModelName(item.name) && !/\.part$/i.test(item.name)) total += item.size;
    }
    return total;
  } catch {
    return 0;
  }
}

/** The edition's file in models/, when it is complete (no .part next to it). */
export function installedModel(edition: Edition): LocalModel | null {
  if (!native) return null;
  try {
    const file = finalFile(edition);
    if (!file.exists || partFile(edition).exists) return null;
    return describe(file, 'models');
  } catch {
    return null;
  }
}

/** Free space on the phone in bytes; -1 when the platform cannot tell. */
export function freeBytes(): number {
  try {
    const free = Paths.availableDiskSpace;
    return Number.isFinite(free) ? free : -1;
  } catch {
    return -1;
  }
}

/** The file name of a picked file. Android's picker answers with a content: uri whose last segment is percent-encoded. */
function pickedName(file: File): string {
  let raw = file.name;
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // not percent-encoded
  }
  return raw.split(/[/\\:]/).pop() || raw;
}

/** The system file picker; null when the learner cancels or picks something that is not a GGUF. */
export async function pickModelFile(): Promise<File | null> {
  try {
    const picked = await File.pickFileAsync();
    if (picked.canceled) return null;
    return isGgufName(pickedName(picked.result)) ? picked.result : null;
  } catch {
    return null;
  }
}

/** Moves a picked file into models/ (copies when the source cannot be moved, e.g. an Android content: uri). */
export async function importModel(file: File): Promise<LocalModel> {
  const name = pickedName(file);
  const dest = new File(ensureModelsDir(), name);
  if (dest.uri !== file.uri) {
    try {
      await file.move(dest, { overwrite: true });
    } catch {
      await file.copy(dest, { overwrite: true });
    }
  }
  return { uri: dest.uri, name, bytes: dest.size, edition: editionOfName(name), where: 'models' };
}

export function deleteLocalModel(model: LocalModel): void {
  const file = new File(model.uri);
  if (file.exists) file.delete();
}

/** models/<file>.part: the download target, renamed to the final name once complete. */
export function partFile(edition: Edition): File {
  return new File(modelsDir, `${editionInfo(edition).file}.part`);
}

/** models/<file>: the edition's model, ready to load. */
export function finalFile(edition: Edition): File {
  return new File(modelsDir, editionInfo(edition).file);
}

const taskOptions = (onProgress: (bytes: number, total: number) => void, signal?: AbortSignal) => ({
  // iOS keeps a background session going while the app is suspended; Android ignores the option
  sessionType: 'background' as const,
  onProgress: ({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }) => onProgress(bytesWritten, totalBytes),
  signal,
});

/** A download task for a model file (not started: call downloadAsync()). */
export function createModelDownload(url: string, dest: File, onProgress: (bytes: number, total: number) => void, signal?: AbortSignal): DownloadTask {
  ensureModelsDir();
  return File.createDownloadTask(url, dest, taskOptions(onProgress, signal));
}

/** A paused task rebuilt from a saved pause state (call resumeAsync()). Throws when the state has no resume data. */
export function restoreModelDownload(state: DownloadPauseState, onProgress: (bytes: number, total: number) => void): DownloadTask {
  ensureModelsDir();
  return DownloadTask.fromSavable(state, taskOptions(onProgress));
}

const isLexiconData = (data: unknown): data is LexiconData =>
  typeof data === 'object' && data !== null && Array.isArray((data as LexiconData).nouns) && Array.isArray((data as LexiconData).verbs);

/** The full lexicon from disk; null when it is not there yet or unreadable (an unreadable file is removed). */
export async function readLexicon(): Promise<LexiconData | null> {
  if (!native) return null;
  try {
    if (!lexiconFile.exists) return null;
    const data: unknown = await lexiconFile.json();
    if (isLexiconData(data)) return data;
    lexiconFile.delete();
    return null;
  } catch {
    return null;
  }
}

/** Fetches the full lexicon from our storage, from the Hub when that fails. */
export async function downloadLexicon(): Promise<void> {
  ensureModelsDir();
  try {
    await File.downloadFileAsync(LEXICON_URL, lexiconFile, { idempotent: true });
  } catch (e) {
    console.warn('[model] lexicon from our storage failed, trying the Hub:', e);
    await File.downloadFileAsync(LEXICON_FALLBACK_URL, lexiconFile, { idempotent: true });
  }
}
