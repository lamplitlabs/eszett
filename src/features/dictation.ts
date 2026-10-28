// Dictation in German with the phone's own speech recognizer (Apple's SFSpeechRecognizer, Android's
// SpeechRecognizer, through expo-speech-recognition), kept on the device: recognition that would send audio to
// a server is not used, so a phone without the offline German pack is told so (and, on Android 13+, offered the
// download) instead of being quietly sent online. One recognition runs at a time; the German read aloud by the
// app is stopped first, as the two share the audio session.

import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent, type ExpoSpeechRecognitionErrorCode } from 'expo-speech-recognition';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

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
  /** Android 13+: asks the system to fetch the offline German pack; null elsewhere. */
  downloadOfflinePack: (() => Promise<void>) | null;
}

const LOCALE = 'de-DE';

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
 * The recognizer for one screen. `onInterim` gets every partial transcript, `onFinal` the settled one;
 * `contextualStrings` are words the recognizer should expect (the sentence the learner is repeating).
 */
export function useDictation(handlers: { onInterim?: (text: string) => void; onFinal?: (text: string) => void; contextualStrings?: string[] } = {}): Dictation {
  const [{ available, reason }, setProbe] = useState(probe);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<ExpoSpeechRecognitionErrorCode | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  const active = useRef(false);

  useSpeechRecognitionEvent('start', () => {
    setListening(true);
    setError(null);
  });
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    active.current = false;
  });
  useSpeechRecognitionEvent('result', (event) => {
    if (!active.current) return;
    const text = event.results[0]?.transcript?.trim() ?? '';
    setTranscript(text);
    if (event.isFinal) {
      if (text) handlersRef.current.onFinal?.(text);
    } else handlersRef.current.onInterim?.(text);
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'aborted') return;
    setError(event.error);
    if (event.error === 'not-allowed') setProbe({ available: false, reason: 'permission' });
  });

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
    active.current = true;
    ExpoSpeechRecognitionModule.start({
      lang: LOCALE,
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: true,
      addsPunctuation: false,
      maxAlternatives: 1,
      iosTaskHint: 'dictation',
      contextualStrings: handlersRef.current.contextualStrings,
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

  const downloadOfflinePack = useMemo(
    () =>
      Platform.OS === 'android' && reason === 'offline-pack'
        ? async () => {
            await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: LOCALE });
            setProbe(probe());
          }
        : null,
    [reason],
  );

  return { available, reason, listening, transcript, error, start, stop, abort, downloadOfflinePack };
}

/**
 * Dictation into a text field: the words heard replace what has been typed since the turn began, so the learner
 * can type, speak, then edit. Undefined when the recognizer cannot be used, and the field shows no microphone.
 */
export function useFieldDictation(value: string, setValue: (text: string) => void): { listening: boolean; onPress: () => void } | undefined {
  const base = useRef('');
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const join = useCallback((text: string) => (base.current ? `${base.current} ${text}` : text), []);
  const d = useDictation({ onInterim: (text) => setValue(join(text)), onFinal: (text) => setValue(join(text)) });
  const onPress = useCallback(() => {
    if (d.listening) d.stop();
    else {
      base.current = valueRef.current.trim();
      void d.start();
    }
  }, [d]);
  return d.available ? { listening: d.listening, onPress } : undefined;
}
