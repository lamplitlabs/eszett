// The course card on Today: the learner's current unit and its next step, one tap from continuing. It reads the
// same progress the course screens do (src/harness/path.ts).

import { router } from 'expo-router';
import { ChevronRight, GraduationCap, Route } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { stepLabel } from '@/features/path';
import type { Level } from '@/harness/levels';
import { levelProgress, nextStep } from '@/harness/path';
import { useI18n } from '@/i18n';
import { localizePathUnit } from '@/i18n/content';
import { useProgress } from '@/state/progress';
import { Paper, Press, ProgressBar } from '@/ui/controls';
import { De, Txt } from '@/ui/Text';
import { radius, space, useTheme } from '@/ui/theme';

export function CourseCard({ level }: { level: Level }) {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const done = useProgress((s) => s.done);
  const progress = levelProgress(level, done);
  if (!progress.units.length) return null;
  const unit = progress.current;
  const index = unit ? progress.units.indexOf(unit) : -1;
  const step = unit ? nextStep(unit, done) : null;
  const next = unit && step !== null ? stepLabel(unit, step, lang).title : null;
  const href = unit ? `/path/${unit.key}` : '/path';
  const label = unit ? t('path.homeUnit', { n: index + 1, total: progress.units.length }) : t('path.levelDone', { level });
  return (
    <Animated.View entering={FadeInDown.duration(380)}>
      <Press onPress={() => router.push(href as never)} scaleTo={0.99} accessibilityLabel={unit ? `${label}, ${localizePathUnit(unit, lang).title_en}` : label} accessibilityHint={next ? t('path.homeNext', { title: next }) : undefined}>
        <Paper style={{ gap: space.m }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
            <View style={{ width: 44, height: 44, borderRadius: radius.control, backgroundColor: unit ? c.royal : c.green, alignItems: 'center', justifyContent: 'center' }}>
              {unit ? <Route size={22} color={c.paper} strokeWidth={2.2} /> : <GraduationCap size={22} color={c.paper} strokeWidth={2.2} />}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="caption" style={{ color: unit ? c.royal : c.green }}>
                {label}
              </Txt>
              {unit ? (
                <De variant="germanStrong" style={{ fontSize: 17, lineHeight: 23 }} numberOfLines={1}>
                  {unit.title_de}
                </De>
              ) : (
                <Txt variant="bodyStrong">{t('path.homeDoneTitle')}</Txt>
              )}
              <Txt variant="small" color="inkSoft" numberOfLines={1}>
                {next ? t('path.homeNext', { title: next }) : unit ? localizePathUnit(unit, lang).title_en : t('path.homeDoneBody')}
              </Txt>
            </View>
            <ChevronRight size={20} color={c.inkFaint} />
          </View>
          <ProgressBar value={progress.ratio} color={unit ? 'royal' : 'green'} />
        </Paper>
      </Press>
    </Animated.View>
  );
}
