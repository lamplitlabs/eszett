// The soft ask for reminders on the home screen: shown once the learner has practised at least once, until the
// phone has been asked or "Not now" was tapped. "Turn on" asks the phone and, when allowed, turns on both the
// practice reminder and the word of the day (src/features/notify.ts); the Me tab holds the finer settings.
import { Bell } from 'lucide-react-native';
import { Platform, View } from 'react-native';

import { enableNotifications, useNotifyPermission } from '@/features/notify';
import { useNotify } from '@/features/notifyStore';
import { useI18n } from '@/i18n';
import { useProgress } from '@/state/progress';
import { Button, Paper } from '@/ui/controls';
import { Txt } from '@/ui/Text';
import { space, useTheme } from '@/ui/theme';

export default function ReminderCard() {
  const { c } = useTheme();
  const { t } = useI18n();
  const permission = useNotifyPermission();
  const answered = useNotify((n) => n.promptAnsweredAt);
  const practised = useProgress((p) => Object.values(p.days).some((n) => n > 0));
  if (Platform.OS === 'web' || permission !== 'undetermined' || answered !== null || !practised) return null;
  return (
    // the bottom margin keeps the rhythm of the sections around it
    <Paper tone="royal" style={{ gap: space.s, marginBottom: space.x3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <Bell size={18} color={c.royal} />
        <Txt variant="bodyStrong" style={{ flex: 1, color: c.royal }}>
          {t('home.reminderTitle')}
        </Txt>
      </View>
      <Txt variant="small" color="inkSoft">
        {t('home.reminderBody')}
      </Txt>
      <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.xs }}>
        <Button label={t('home.reminderOn')} size="medium" grow onPress={() => void enableNotifications()} />
        <Button label={t('home.reminderLater')} kind="secondary" size="medium" grow onPress={() => useNotify.getState().set({ promptAnsweredAt: Date.now() })} />
      </View>
    </Paper>
  );
}
