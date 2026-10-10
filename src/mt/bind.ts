// Keeps the language pack in step with the settings: the app language's pack when translation is on, none
// otherwise. Call once at start-up, after the settings are hydrated.
import { resolveLanguage } from '@/i18n/bind';
import { useSettings } from '@/state/settings';

import { useTranslator } from './store';

export function bindTranslator(): () => void {
  const apply = () => {
    const { language, translate } = useSettings.getState();
    void useTranslator.getState().sync(resolveLanguage(language), translate);
  };
  apply();
  return useSettings.subscribe((s, prev) => {
    if (s.language !== prev.language || s.translate !== prev.translate) apply();
  });
}
