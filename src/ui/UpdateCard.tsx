// "A new version of Eszett is in the store": a card over the screen a learner can put off, or, below the
// minimum version, a full page with only the way to the store. Shown from the root layout.
import Constants from 'expo-constants';
import { useEffect } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkForUpdate, evaluateRelease, useRelease, type UpdateVerdict } from '@/features/release';
import { useI18n } from '@/i18n';

import { Button, Paper } from './controls';
import { Txt } from './Text';
import { gutter, space, useTheme } from './theme';

export const APP_VERSION: string = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '0.0.0';

/** The verdict for the installed version, kept fresh (one check a day). */
export function useUpdateVerdict(enabled: boolean): UpdateVerdict & { dismissed: boolean; dismiss: () => void } {
  const { lang } = useI18n();
  const info = useRelease((s) => s.info);
  const dismissed = useRelease((s) => s.dismissed);
  const set = useRelease((s) => s.set);
  useEffect(() => {
    if (enabled) void checkForUpdate();
  }, [enabled]);
  const verdict = evaluateRelease(info, Platform.OS, APP_VERSION, lang);
  return { ...verdict, dismissed: verdict.version !== null && dismissed === verdict.version, dismiss: () => set({ dismissed: verdict.version }) };
}

const open = (url: string) => Linking.openURL(url).catch(() => undefined);

export function UpdateCard({ verdict }: { verdict: ReturnType<typeof useUpdateVerdict> }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (!verdict.available || !verdict.storeUrl || verdict.dismissed) return null;
  const storeUrl = verdict.storeUrl;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 72, paddingHorizontal: gutter }}>
      <Paper style={{ padding: space.l, gap: space.s, borderWidth: 1, borderColor: c.rule }}>
        <Txt variant="headline">{t('update.title')}</Txt>
        <Txt variant="small" color="inkSoft">
          {verdict.notes ?? t('update.body', { version: verdict.version ?? '' })}
        </Txt>
        <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.xs }}>
          <Button label={t('update.open')} size="medium" grow onPress={() => void open(storeUrl)} />
          <Button label={t('common.later')} size="medium" kind="quiet" onPress={verdict.dismiss} />
        </View>
      </Paper>
    </View>
  );
}

/** The page shown instead of the app when the installed version is below the minimum. */
export function UpdateRequired({ verdict }: { verdict: UpdateVerdict }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const storeUrl = verdict.storeUrl ?? '';
  return (
    <View style={{ flex: 1, backgroundColor: c.paper, justifyContent: 'center', paddingHorizontal: gutter, gap: space.m }}>
      <Txt variant="title">{t('update.requiredTitle')}</Txt>
      <Txt variant="body" color="inkSoft">
        {t('update.requiredBody', { version: verdict.version ?? '' })}
      </Txt>
      {verdict.notes ? (
        <Txt variant="small" color="inkSoft">
          {verdict.notes}
        </Txt>
      ) : null}
      <Button label={t('update.open')} onPress={() => void open(storeUrl)} style={{ marginTop: space.m }} />
    </View>
  );
}
