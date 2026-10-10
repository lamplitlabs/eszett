// German read aloud with the device's own voices (no network). The best installed German voice is picked
// once: an "Enhanced" de-DE voice when the device has one.

import * as Speech from 'expo-speech';

import { useSettings } from '@/state/settings';

let voice: string | undefined;
let voiceLookup: Promise<void> | null = null;

function pickVoice() {
  voiceLookup ??= Speech.getAvailableVoicesAsync()
    .then((voices) => {
      const german = voices.filter((v) => /^de(-|_)?/i.test(v.language));
      const preferred =
        german.find((v) => /de.DE/i.test(v.language) && v.quality === Speech.VoiceQuality.Enhanced) ??
        german.find((v) => /de.DE/i.test(v.language)) ??
        german[0];
      voice = preferred?.identifier;
    })
    .catch(() => undefined);
  return voiceLookup;
}

let speakingId = 0;
const listeners = new Set<(text: string | null) => void>();
let current: string | null = null;

function setCurrent(text: string | null) {
  current = text;
  listeners.forEach((l) => l(text));
}

/** Reads German text aloud; calling it again (or with the same text while speaking) stops the first. */
export async function speak(text: string, opts: { rate?: number } = {}) {
  const clean = text
    .replace(/\*\*|__|[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return;
  const wasSame = current === clean;
  Speech.stop();
  if (wasSame) {
    setCurrent(null);
    return;
  }
  await pickVoice();
  const id = (speakingId += 1);
  setCurrent(clean);
  Speech.speak(clean, {
    language: 'de-DE',
    voice,
    rate: opts.rate ?? useSettings.getState().speechRate,
    onDone: () => {
      if (id === speakingId) setCurrent(null);
    },
    onStopped: () => {
      if (id === speakingId) setCurrent(null);
    },
    onError: () => {
      if (id === speakingId) setCurrent(null);
    },
  });
}

export function stopSpeaking() {
  Speech.stop();
  setCurrent(null);
}

/** Subscribe to what is being read aloud (for the speaker icon's active state). */
export function onSpeaking(listener: (text: string | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const speakingNow = () => current;
