// The words the app uses for the tutor model's status, in one place so every screen says the same thing. The
// tables hold catalog keys and are resolved when a screen asks, so they follow the app language. Screens pass
// `lang` from useI18n(): the React Compiler memoises a call on its arguments, so a hidden current language would
// leave the old wording on screen after a switch.

import { getLanguage, tIn } from '@/i18n';
import type { AppLang } from '@/i18n/languages';
import { useModel, type ModelStatus } from '@/model/runtime';

/** The short status line, as the model sheet words it. */
const STATUS_KEY: Record<ModelStatus, string> = {
  checking: 'model.statusChecking',
  absent: 'model.statusAbsent',
  downloading: 'model.statusDownloading',
  paused: 'model.statusPaused',
  loading: 'model.statusLoading',
  ready: 'model.statusReady',
  error: 'model.statusError',
  unavailable: 'model.statusUnavailable',
  locked: 'model.statusLocked',
};

/** A 0..1 progress as whole percent, so screens re-render once per percent and not once per chunk. */
export const pctOf = (progress: number) => Math.round(Math.max(0, Math.min(1, progress)) * 100);

export const useModelStatus = () => useModel((s) => s.status);
export const useModelPercent = () => useModel((s) => pctOf(s.progress));

/** "Downloading (42%)"; every other status is its plain label. */
export function statusLabel(status: ModelStatus, pct = 0, lang: AppLang = getLanguage()): string {
  return tIn(lang, STATUS_KEY[status], { pct });
}

/** "Light German Tutor Phone v25", without repeating a version the name already carries. */
export function modelTitle(info: { name: string; version?: string | null }, sep = ' '): string {
  return info.version && !info.name.includes(info.version) ? `${info.name}${sep}${info.version}` : info.name;
}

/** The line under the greeting on Today: one sentence about the tutor, a nudge when it is missing. */
const TUTOR_LINE_KEY: Record<ModelStatus, string> = {
  ready: 'model.tutorLineReady',
  checking: 'model.tutorLineChecking',
  absent: 'model.tutorLineAbsent',
  downloading: 'model.tutorLineDownloading',
  paused: 'model.tutorLinePaused',
  loading: 'model.tutorLineLoading',
  error: 'model.tutorLineError',
  unavailable: 'model.tutorLineUnavailable',
  locked: 'model.tutorLineLocked',
};

export function tutorLine(status: ModelStatus, pct = 0, lang: AppLang = getLanguage()): string {
  return tIn(lang, TUTOR_LINE_KEY[status], { pct });
}

/** The inline note a screen shows where the tutor's answer would go while the model is not ready. */
const NOT_READY_NOTE_KEY: Record<Exclude<ModelStatus, 'ready'>, string> = {
  checking: 'model.noteChecking',
  absent: 'model.noteAbsent',
  downloading: 'model.noteDownloading',
  paused: 'model.notePaused',
  loading: 'model.noteLoading',
  error: 'model.noteError',
  unavailable: 'model.noteUnavailable',
  locked: 'model.noteLocked',
};

export function notReadyNote(status: ModelStatus, pct = 0, lang: AppLang = getLanguage()): string {
  return status === 'ready' ? '' : tIn(lang, NOT_READY_NOTE_KEY[status], { pct });
}
