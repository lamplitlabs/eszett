// "A new tutor is ready" on the Home tab (src/model/update.ts): shown while the model in use is a previous
// student's. With full access the button downloads; in the free week it leads to full access; "Not now" puts
// the card away until the next tutor. No model details - the learner needs none to decide.

import { router } from 'expo-router';
import { Download, KeyRound, Sparkles } from 'lucide-react-native';
import { View } from 'react-native';

import { useAccessView } from '@/features/access';
import { useRelease } from '@/features/release';
import { useI18n } from '@/i18n';
import { describeBytes, estimatedBytes, MODEL_STUDENT } from '@/model/manifest';
import { useModel } from '@/model/runtime';
import { modelUpdateAction } from '@/model/update';
import { Button, Paper } from '@/ui/controls';
import { Txt } from '@/ui/Text';
import { space, useTheme } from '@/ui/theme';

export default function ModelUpdateCard() {
  const { c } = useTheme();
  const { t } = useI18n();
  const access = useAccessView();
  const outdated = useModel((s) => s.outdated);
  const status = useModel((s) => s.status);
  const edition = useModel((s) => s.edition);
  const gate = useModel((s) => s.gate);
  const dismissed = useRelease((s) => s.modelDismissed);
  const set = useRelease((s) => s.set);
  const action = modelUpdateAction(outdated, access, dismissed);
  if (action === 'none' || status === 'downloading' || status === 'paused') return null;
  // the server has spoken: the gate says what is missing, whatever the phone's own record thinks
  const toUnlock = action === 'unlock' || gate?.kind === 'entitlement';
  return (
    <Paper tone="amber" style={{ gap: space.s, marginBottom: space.x3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <Sparkles size={18} color={c.amberInk} />
        <Txt variant="bodyStrong" style={{ flex: 1, color: c.amberInk }}>
          {t('model.newTutorTitle')}
        </Txt>
      </View>
      <Txt variant="small" color="inkSoft">
        {toUnlock ? t('model.newTutorUnlock') : t('model.newTutorDetail', { size: describeBytes(estimatedBytes(edition)) })}
      </Txt>
      <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.xs }}>
        {toUnlock ? (
          <Button label={t('unlock.open')} icon={KeyRound} size="medium" grow onPress={() => router.push('/unlock')} />
        ) : (
          <Button label={t('model.newTutorDownload')} icon={Download} size="medium" grow onPress={() => void useModel.getState().download(edition)} />
        )}
        <Button label={t('common.later')} kind="secondary" size="medium" grow onPress={() => set({ modelDismissed: MODEL_STUDENT })} />
      </View>
    </Paper>
  );
}
