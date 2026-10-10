// Connects the pure i18n module to the app: the saved language setting ('auto' follows the phone), the device
// locales from expo-localization, and the layout direction for right-to-left languages.
import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';

import { useSettings } from '@/state/settings';

import { setLanguage } from './index';
import { explainLangFor, isRtl, pickDeviceLanguage, type AppLang } from './languages';

/** The language the app shows for a setting: the device's first supported locale when the setting is 'auto'. */
export function resolveLanguage(setting: 'auto' | AppLang): AppLang {
  if (setting !== 'auto') return setting;
  let tags: (string | null | undefined)[] = [];
  try {
    tags = getLocales().map((l) => l.languageTag ?? l.languageCode);
  } catch {
    tags = [];
  }
  return pickDeviceLanguage(tags);
}

/** Applies the layout direction; React Native only picks a change up at the next start of the app. */
function applyDirection(lang: AppLang): boolean {
  const rtl = isRtl(lang);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  return true;
}

/** Call once at start-up: sets the language now and follows the setting afterwards. */
export function bindLanguage(): () => void {
  const apply = (setting: 'auto' | AppLang, changed: boolean) => {
    const lang = resolveLanguage(setting);
    setLanguage(lang);
    applyDirection(lang);
    // the app language is the one setting: the tutor explains in it (English when the model cannot), and a
    // language the learner pinned under "Explanations in" only holds until they pick another app language
    const s = useSettings.getState();
    const pinned = !changed && s.explainInPinned ? s.explainIn : null;
    const explainIn = explainLangFor(lang, pinned);
    if (explainIn !== s.explainIn || Boolean(pinned) !== s.explainInPinned) useSettings.getState().set({ explainIn, explainInPinned: Boolean(pinned) });
  };
  apply(useSettings.getState().language, false);
  return useSettings.subscribe((s, prev) => {
    if (s.language !== prev.language) apply(s.language, true);
  });
}

/** True when the layout direction of the current language differs from the one the app started with. */
export const directionPending = (lang: AppLang) => I18nManager.isRTL !== isRtl(lang);
