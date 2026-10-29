// Exam-style listening: the phone's German voice over a background of the place the text could be heard in - a
// station concourse, a café, a street - so the ear learns to pick the words out of noise, as the Goethe and telc
// Hören parts ask (announcements, messages, conversations in public). The beds are short procedural ambiences
// bundled with the app (assets/sounds, no recordings of people), looped under the voice at a level the learner
// picks; the voice is expo-speech, the bed expo-audio, started and stopped together.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';

import { onSpeaking, speak, stopSpeaking } from '@/ui/speech';

export type Ambience = 'station' | 'cafe' | 'street' | 'phone' | 'room';
/** The places a reading text can be heard in (the situations add the phone line and a quiet room). */
export const AMBIENCES: Ambience[] = ['station', 'cafe', 'street'];

/** How loud the bed plays under the voice: quiet is a hint of a room, loud is a real concourse. */
export type NoiseLevel = 'quiet' | 'medium' | 'loud';
export const NOISE_VOLUME: Record<NoiseLevel, number> = { quiet: 0.18, medium: 0.38, loud: 0.62 };

const SOURCES: Record<Ambience, number> = {
  station: require('../../assets/sounds/station.mp3'),
  cafe: require('../../assets/sounds/cafe.mp3'),
  street: require('../../assets/sounds/street.mp3'),
  phone: require('../../assets/sounds/phone.mp3'),
  room: require('../../assets/sounds/room.mp3'),
};
/** What sounds before the voice: the loudspeaker's chime, the phone's beep. */
export type Cue = 'chime' | 'beep';
const CUES: Record<Cue, number> = {
  chime: require('../../assets/sounds/chime.mp3'),
  beep: require('../../assets/sounds/beep.mp3'),
};
let cuePlayer: AudioPlayer | null = null;

let player: AudioPlayer | null = null;
let current: Ambience | null = null;
let unsubscribe: (() => void) | null = null;

async function bed(kind: Ambience): Promise<AudioPlayer | null> {
  if (Platform.OS === 'web') return null;
  if (player && current === kind) return player;
  player?.remove();
  await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => undefined);
  player = createAudioPlayer(SOURCES[kind]);
  player.loop = true;
  current = kind;
  return player;
}

/**
 * Reads the text aloud over the ambience; the bed fades in a moment before the voice and stops when the voice
 * ends (or is stopped). Resolves when the voice has started.
 */
export async function speakInNoise(text: string, kind: Ambience, level: NoiseLevel, opts: { rate?: number; cue?: Cue } = {}): Promise<void> {
  const p = await bed(kind);
  unsubscribe?.();
  unsubscribe = null;
  if (p) {
    p.volume = NOISE_VOLUME[level];
    p.seekTo(Math.random() * 12).catch(() => undefined);
    p.play();
    unsubscribe = onSpeaking((now) => {
      if (now === null) {
        p.pause();
        unsubscribe?.();
        unsubscribe = null;
      }
    });
  }
  // a short lead so the ear settles into the room before the first word; a cue (chime, beep) fills it
  if (opts.cue && Platform.OS !== 'web') {
    cuePlayer?.remove();
    cuePlayer = createAudioPlayer(CUES[opts.cue]);
    cuePlayer.volume = 0.7;
    cuePlayer.play();
    await new Promise((r) => setTimeout(r, opts.cue === 'chime' ? 1500 : 900));
  } else await new Promise((r) => setTimeout(r, 700));
  await speak(text, { rate: opts.rate });
}

export function stopNoise() {
  stopSpeaking();
  player?.pause();
  unsubscribe?.();
  unsubscribe = null;
}
