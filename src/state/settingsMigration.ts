// How settings saved by an older build become today's shape. Pure TypeScript over the model manifest, so it is
// testable in node; src/state/settings.ts hands it to zustand's persist middleware.
import { isTutorLang } from '../i18n/languages';
import { DEFAULT_EDITION, isEdition } from '../model/manifest';

/**
 * Version 1 pointed at a model host on the laptop (hostUrl); version 2 runs the model on the phone; version 3 moved
 * the editions to the v13 export (Q5_K_M replaces Q6_K) and starts the download by itself; version 4 adds the app
 * language ('auto' follows the phone) and widens the tutor's explanation language.
 */
export function migrateSettings(persisted: unknown, version: number): Record<string, unknown> {
  const state = { ...((persisted ?? {}) as Record<string, unknown>) };
  if (version < 2) {
    delete state.hostUrl;
    state.modelSource = '';
    state.modelFile = '';
  }
  if (version < 3) state.autoDownload = true;
  if (version < 4) {
    state.language = 'auto';
    // a learner who had switched the explanations to German keeps them; English was the default, so it may follow the app language
    state.explainInPinned = state.explainIn === 'de';
  }
  if (!isTutorLang(state.explainIn)) state.explainIn = 'en';
  // an edition that no longer exists (Q6_K from the previous build) falls back to the phone edition
  if (!isEdition(state.edition)) state.edition = DEFAULT_EDITION;
  return state;
}
