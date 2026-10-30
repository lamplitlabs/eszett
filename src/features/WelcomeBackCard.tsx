// "Schön, dass du wieder da bist": the card a learner sees after a few days away. No guilt about the streak -
// the research is clear that shaming sends people away - just a warm line, where they left off, and one tap to
// continue. Once a day, until they practise.

import { router } from 'expo-router';
import { Sun } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { daysAway, useMoments, welcomeBackDue } from '@/features/moments';
import { levelProgress } from '@/harness/path';
import { useI18n } from '@/i18n';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { dayKey } from '@/state/storage';
import { Button, Paper } from '@/ui/controls';
import { De, Txt } from '@/ui/Text';
import { space, useTheme } from '@/ui/theme';

export default function WelcomeBackCard() {
  const { c } = useTheme();
  const { t } = useI18n();
  const days = useProgress((p) => p.days);
  const done = useProgress((p) => p.done);
  const level = useSettings((s) => s.level);
  const shownOn = useMoments((m) => m.welcomeShownOn);
  const set = useMoments((m) => m.set);
  if (!welcomeBackDue(days, shownOn)) return null;
  const away = daysAway(days) ?? 0;
  const course = levelProgress(level, done);
  const unit = course.current;
  const dismiss = () => set({ welcomeShownOn: dayKey() });
  return (
    <Animated.View entering={FadeInDown.duration(400)}>
      <Paper tone="royal" style={{ gap: space.s, marginBottom: space.x3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
          <Sun size={18} color={c.royal} />
          <De variant="germanStrong" style={{ flex: 1, color: c.royal }}>
            Schön, dass du wieder da bist!
          </De>
        </View>
        <Txt variant="small" color="inkSoft">
          {t('welcome.back', { count: away + 1 })} {unit ? t('welcome.where', { week: unit.title_de }) : ''}
        </Txt>
        <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.xs }}>
          <Button
            label={t('welcome.continue')}
            size="medium"
            grow
            onPress={() => {
              dismiss();
              router.push(unit ? `/path/${unit.key}` : '/practice');
            }}
          />
          <Button label={t('common.later')} kind="secondary" size="medium" onPress={dismiss} />
        </View>
      </Paper>
    </Animated.View>
  );
}
