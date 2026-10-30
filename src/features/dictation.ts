// Dictation in German with the phone's own speech recognizer (Apple's SFSpeechRecognizer, Android's
// SpeechRecognizer, through expo-speech-recognition), kept on the device: recognition that would send audio to
// a server is not used, so a phone without the offline German pack is told so (and, on Android 13+, offered the
// download) instead of being quietly sent online. One recognition runs at a time; the German read aloud by the
// app is stopped first, as the two share the audio session.

import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent, type ExpoSpeechRecognitionErrorCode } from 'expo-speech-recognition';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';

import { useI18n } from '@/i18n';
import { stopSpeaking } from '@/ui/speech';

export type DictationReason = 'web' | 'unavailable' | 'offline-pack' | 'permission' | null;

export interface Dictation {
  /** The recognizer can be used: on the device, for German. */
  available: boolean;
  /** Why not, when it cannot. */
  reason: DictationReason;
  listening: boolean;
  /** What has been heard so far in this turn (interim), or the final transcript. */
  transcript: string;
  error: ExpoSpeechRecognitionErrorCode | null;
  /** Starts a turn; the words arrive in `transcript` and, once settled, in `onFinal`. */
  start: () => Promise<void>;
  /** Ends the turn and lets the recognizer settle on a final result. */
  stop: () => void;
  /** Drops the turn without a result. */
  abort: () => void;
  /** Clears the last error and transcript, so a screen starting a new turn does not read the old failure. */
  reset: () => void;
  /** Android 13+: asks the system to fetch the offline German pack; null elsewhere. */
  downloadOfflinePack: (() => Promise<void>) | null;
}

const LOCALE = 'de-DE';
/** Android's on-device recognizer (Android System Intelligence), the one that knows which packs are installed. */
const ON_DEVICE_SERVICE = 'com.google.android.as';
const GERMAN = /^de(?:[-_]|$)/i;

function probe(): { available: boolean; reason: DictationReason } {
  if (Platform.OS === 'web') return { available: false, reason: 'web' };
  try {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return { available: false, reason: 'unavailable' };
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return { available: false, reason: 'offline-pack' };
    return { available: true, reason: null };
  } catch {
    return { available: false, reason: 'unavailable' };
  }
}

/**
 * Android 13+: whether the on-device recognizer has a German pack installed. The phone may support offline
 * recognition in general and still lack German; starting a turn then fails with `language-not-supported`.
 * Null when the phone cannot say (older Android, another recognizer, iOS).
 */
async function germanPackInstalled(): Promise<boolean | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const { locales, installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({ androidRecognitionServicePackage: ON_DEVICE_SERVICE });
    if (locales.length === 0 && installedLocales.length === 0) return null;
    return installedLocales.some((locale) => GERMAN.test(locale));
  } catch {
    return null;
  }
}

/**
 * The recognizer for one screen. `onInterim` gets every partial transcript, `onFinal` the settled one;
 * `contextualStrings` are words the recognizer should expect (the sentence the learner is repeating).
 */
export interface DictationHandlers {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  contextualStrings?: string[];
  /**
   * Keep listening through pauses until `stop()`: the recognizer settles one segment at a time (Android 13+),
   * the segments are joined, `onInterim` gets the whole so far and `onFinal` the whole at the end. For a
   * sentence repeated after the voice the default (one utterance, ends at the first pause) is right; a talk of
   * two or three minutes in the mock exam needs this.
   */
  continuous?: boolean;
}

export function useDictation(handlers: DictationHandlers = {}): Dictation {
  const [{ available, reason }, setProbe] = useState(probe);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<ExpoSpeechRecognitionErrorCode | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  const active = useRef(false);
  // the settled segments of a continuous turn
  const segments = useRef<string[]>([]);
  const joined = (tail = '') => [...segments.current, tail].filter(Boolean).join(' ');

  useSpeechRecognitionEvent('start', () => {
    setListening(true);
    setError(null);
  });
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    const wasActive = active.current;
    active.current = false;
    if (wasActive && handlersRef.current.continuous) handlersRef.current.onFinal?.(joined());
  });
  useSpeechRecognitionEvent('result', (event) => {
    if (!active.current) return;
    const text = event.results[0]?.transcript?.trim() ?? '';
    if (handlersRef.current.continuous) {
      if (event.isFinal && text) segments.current.push(text);
      const full = event.isFinal ? joined() : joined(text);
      setTranscript(full);
      handlersRef.current.onInterim?.(full);
      return;
    }
    setTranscript(text);
    if (event.isFinal) {
      if (text) handlersRef.current.onFinal?.(text);
    } else handlersRef.current.onInterim?.(text);
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'aborted') return;
    // a continuous turn that already has words ends with the recognizer's own complaint; the words count
    if (handlersRef.current.continuous && segments.current.length) return;
    setError(event.error);
    if (event.error === 'not-allowed') setProbe({ available: false, reason: 'permission' });
    // "Supported, but not yet downloaded": the German pack is missing, so offer it instead of a bare error.
    if (event.error === 'language-not-supported') setProbe({ available: false, reason: 'offline-pack' });
  });

  useEffect(() => {
    let cancelled = false;
    void germanPackInstalled().then((installed) => {
      if (!cancelled && installed === false) setProbe({ available: false, reason: 'offline-pack' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (active.current) ExpoSpeechRecognitionModule.abort();
    },
    [],
  );

  const start = useCallback(async () => {
    if (!available || active.current) return;
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setProbe({ available: false, reason: 'permission' });
      return;
    }
    stopSpeaking();
    setTranscript('');
    setError(null);
    segments.current = [];
    active.current = true;
    const continuous = Boolean(handlersRef.current.continuous);
    ExpoSpeechRecognitionModule.start({
      lang: LOCALE,
      interimResults: true,
      continuous,
      requiresOnDeviceRecognition: true,
      addsPunctuation: false,
      maxAlternatives: 1,
      iosTaskHint: 'dictation',
      contextualStrings: handlersRef.current.contextualStrings,
      // a talk has pauses for thought; a segment should not end at the first one
      androidIntentOptions: continuous ? { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2500 } : undefined,
    });
  }, [available]);

  const stop = useCallback(() => {
    if (active.current) ExpoSpeechRecognitionModule.stop();
  }, []);

  const abort = useCallback(() => {
    if (active.current) ExpoSpeechRecognitionModule.abort();
    active.current = false;
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setTranscript('');
  }, []);

  const downloadOfflinePack = useMemo(
    () =>
      Platform.OS === 'android' && reason === 'offline-pack'
        ? async () => {
            // Android 13 opens the system's download dialog and returns at once; 14+ downloads or schedules the
            // pack. The Speak button comes back either way; a turn before the pack has arrived fails with
            // `language-not-supported`, which brings this offer back.
            await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: LOCALE });
            setProbe(probe());
          }
        : null,
    [reason],
  );

  return { available, reason, listening, transcript, error, start, stop, abort, reset, downloadOfflinePack };
}

export interface FieldDictation {
  listening: boolean;
  /** False while the German pack is missing: the microphone is shown dimmed and offers the download. */
  available: boolean;
  onPress: () => void;
}

/**
 * Dictation into a text field: the words heard replace what has been typed since the turn began, so the learner
 * can type, speak, then edit. Undefined when the recognizer cannot be used at all, and the field shows no
 * microphone; when only the offline German pack is missing, the microphone stays and offers the download.
 */
export function useFieldDictation(value: string, setValue: (text: string) => void): FieldDictation | undefined {
  const { t } = useI18n();
  const base = useRef('');
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const join = useCallback((text: string) => (base.current ? `${base.current} ${text}` : text), []);
  const d = useDictation({ onInterim: (text) => setValue(join(text)), onFinal: (text) => setValue(join(text)) });
  const download = d.downloadOfflinePack;
  const onPress = useCallback(() => {
    if (!d.available) {
      if (download) {
        Alert.alert(t('ui.dictate'), t('ui.dictateOfflinePack'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('speak.downloadPack'), onPress: () => void download() },
        ]);
      }
      return;
    }
    if (d.listening) d.stop();
    else {
      base.current = valueRef.current.trim();
      void d.start();
    }
  }, [d, download, t]);
  if (d.available) return { listening: d.listening, available: true, onPress };
  return download ? { listening: false, available: false, onPress } : undefined;
}
