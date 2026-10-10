import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Level } from '@/harness/levels';
import type { Lang } from '@/harness/route';
import type { AppLang } from '@/i18n/languages';
import { DEFAULT_EDITION, type Edition } from '@/model/manifest';

import { migrateSettings } from './settingsMigration';
import { storage } from './storage';

export type ThemePref = 'system' | 'light' | 'dark';

type Setter = 'set' | 'setEdition' | 'setModelSource' | 'setModelFile' | 'setAutoDownload';

export interface Settings {
  onboarded: boolean;
  level: Level;
  /** The language of the app (menus, cards, rule sentences); 'auto' follows the phone's language. */
  language: 'auto' | AppLang;
  /**
   * The language the tutor explains in when the app asks on the learner's behalf. Follows the app language
   * (src/i18n/bind.ts): the same language when the model handles it, else English, unless pinned.
   */
  explainIn: Lang;
  /** True while the learner's own pick under "Explanations in" overrides the app language; cleared when the app language changes. */
  explainInPinned: boolean;
  /** Translations under role-play lines, into the tutor's language when it is one the model glosses in, else English. */
  glosses: boolean;
  /**
   * Translate the tutor's English into the app language on this phone (Google ML Kit, a ~30 MB pack per language,
   * nothing leaves the device). Offered for the languages the model cannot explain in itself (src/mt).
   */
  translate: boolean;
  /** Check each of the learner's role-play lines with the tutor as they go. */
  correctAsYouGo: boolean;
  speechRate: number;
  /** Read the other person's lines aloud in scenes. */
  autoSpeak: boolean;
  theme: ThemePref;
  /** The GGUF edition to download and run: Q5_K_M (the phone edition) or Q8_0 (phones with 8 GB or more). */
  edition: Edition;
  /** A custom download base URL (a mirror, or a computer on the Wi-Fi during development); empty = our storage. */
  modelSource: string;
  /** The uri of a sideloaded GGUF the learner chose; empty = the edition's file in models/. */
  modelFile: string;
  /** Start downloading the edition when the app opens without a model; off once the learner cancels or removes it. */
  autoDownload: boolean;
  set: (patch: Partial<Omit<Settings, Setter>>) => void;
  setEdition: (edition: Edition) => void;
  setModelSource: (modelSource: string) => void;
  setModelFile: (modelFile: string) => void;
  setAutoDownload: (autoDownload: boolean) => void;
}

/** Older saved settings (see settingsMigration.ts): v1 had a laptop host, v2 the Q6_K edition, v3 downloads by itself, v4 adds the language. */
const migrate = (persisted: unknown, version: number): Settings => migrateSettings(persisted, version) as unknown as Settings;

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      onboarded: false,
      level: 'A2',
      language: 'auto',
      explainIn: 'en',
      explainInPinned: false,
      glosses: true,
      translate: false,
      correctAsYouGo: true,
      speechRate: 0.9,
      autoSpeak: true,
      theme: 'system',
      edition: DEFAULT_EDITION,
      modelSource: '',
      modelFile: '',
      autoDownload: true,
      set: (patch) => set(patch),
      setEdition: (edition) => set({ edition }),
      setModelSource: (modelSource) => set({ modelSource }),
      setModelFile: (modelFile) => set({ modelFile }),
      setAutoDownload: (autoDownload) => set({ autoDownload }),
    }),
    { name: 'eszett.settings', storage, version: 4, migrate },
  ),
);
