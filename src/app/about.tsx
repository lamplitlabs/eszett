// About Eszett: what it is built on, the licences, the website's legal pages, updates, the store rating.
import { Linking, ScrollView, View } from 'react-native';
import { RefreshCw, Star } from 'lucide-react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import modelInfo from '@/data/model.json';
import { checkForUpdate, useRelease, type CheckOutcome } from '@/features/release';
import { openStorePage, storePageUrl } from '@/features/review';
import { useI18n } from '@/i18n';
import { Divider, Paper, Pill } from '@/ui/controls';
import { LinkRow } from '@/ui/Rows';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { APP_VERSION, useUpdateVerdict } from '@/ui/UpdateCard';
import { gutter, space, useTheme } from '@/ui/theme';

/** The website with the legal pages (privacy, terms, imprint) and support; the same URLs are in the store listings. */
export const WEBSITE = 'https://eszett.lamplitlabs.com';

export default function AboutScreen() {
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [updateCheck, setUpdateCheck] = useState<'idle' | 'busy' | CheckOutcome>('idle');
  const update = useUpdateVerdict(false);
  const checkUpdatesNow = async () => {
    if (updateCheck === 'busy') return;
    setUpdateCheck('busy');
    // a learner who asks wants to see a card they put off earlier
    useRelease.getState().set({ dismissed: null });
    setUpdateCheck(await checkForUpdate({ force: true }));
  };
  const updateNote =
    updateCheck === 'busy'
      ? t('me.checkingUpdates')
      : updateCheck === 'failed'
        ? t('me.checkFailed')
        : updateCheck === 'idle'
          ? t('me.versionInstalled', { version: APP_VERSION })
          : update.available && update.version
            ? t('me.updateFound', { version: update.version })
            : t('me.upToDate', { version: APP_VERSION });

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('me.about')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: space.m, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        <Paper tone="alt" style={{ gap: space.s }}>
          <De variant="germanStrong">Eszett</De>
          <Txt variant="small" color="inkSoft">
            {t('me.aboutText', { repo: modelInfo.hub.repo, student: modelInfo.student })}
          </Txt>
          <Txt variant="small" color="inkSoft">
            {t('me.licence', { attribution: t('me.attribution') })}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.xs }}>
            {(
              [
                ['privacy', t('me.linkPrivacy')],
                ['terms', t('me.linkTerms')],
                ['imprint', t('me.linkImprint')],
                ['support', t('me.linkSupport')],
              ] as const
            ).map(([page, label]) => (
              <Pill key={page} tone="royal" label={label} onPress={() => void Linking.openURL(`${WEBSITE}/${page}`)} />
            ))}
          </View>
        </Paper>
        <Paper style={{ paddingVertical: space.xs }}>
          <LinkRow icon={RefreshCw} tone="royal" label={t('me.checkUpdates')} detail={updateNote} onPress={() => void checkUpdatesNow()} />
          {storePageUrl() ? (
            <>
              <Divider />
              <LinkRow icon={Star} tone="royal" label={t('me.rate')} detail={t('me.rateDetail')} onPress={() => void openStorePage()} />
            </>
          ) : null}
        </Paper>
      </ScrollView>
    </View>
  );
}
