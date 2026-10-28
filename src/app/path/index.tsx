// The course: the learner's level, unit by unit. Every unit is a can-do goal and a handful of steps that open the
// app's own screens (see src/harness/path.ts); progress comes from the same `done` keys the daily lesson writes.
// When every unit of a level is done, the screen offers to move up a level.

import { router } from 'expo-router';
import { ArrowUp, Check, ChevronRight, GraduationCap } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LEVEL_INFO, LEVELS, levelIndex, TOP_LEVEL } from '@/harness/levels';
import { levelProgress, type PathUnit, unitDone, unitFinishedCount } from '@/harness/path';
import { useI18n } from '@/i18n';
import { localizeLevel, localizePathUnit } from '@/i18n/content';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Button, Paper, Pill, Press, ProgressBar } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { gutter, space, useTheme } from '@/ui/theme';

function UnitRow({ unit, index, current, done, onPress }: { unit: PathUnit; index: number; current: boolean; done: Record<string, number>; onPress: () => void }) {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const shown = localizePathUnit(unit, lang);
  const finished = unitDone(unit, done);
  const steps = unitFinishedCount(unit, done);
  const total = unit.steps.length;
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(320)}>
      <Press onPress={onPress} scaleTo={0.99} accessibilityLabel={t('path.unitA11y', { n: index + 1, title: shown.title_en, done: steps, total })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.l, borderTopWidth: index ? 1 : 0, borderTopColor: c.rule }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: finished ? c.green : current ? c.royal : c.sheetAlt }}>
            {finished ? (
              <Animated.View entering={ZoomIn.duration(260)}>
                <Check size={17} color="#fff" strokeWidth={3} />
              </Animated.View>
            ) : (
              <Txt variant="smallStrong" style={{ color: current ? c.onRoyal : c.inkSoft }}>
                {index + 1}
              </Txt>
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <De variant="germanStrong" style={[{ fontSize: 17, lineHeight: 23 }, finished && { color: c.inkSoft }]}>
              {unit.title_de}
            </De>
            {lang !== 'de' ? (
              <Txt variant="small" color="inkSoft" numberOfLines={1}>
                {shown.title_en}
              </Txt>
            ) : null}
            <Txt variant="caption" style={{ color: finished ? c.green : current ? c.royal : c.inkFaint, marginTop: 2 }}>
              {t('path.week', { n: index + 1 })} · {finished ? t('path.unitDone') : t('path.stepsOf', { done: steps, total })}
            </Txt>
          </View>
          <ChevronRight size={18} color={c.inkFaint} />
        </View>
      </Press>
    </Animated.View>
  );
}

export default function PathScreen() {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const setSettings = useSettings((s) => s.set);
  const done = useProgress((s) => s.done);
  const progress = levelProgress(level, done);
  const info = localizeLevel(LEVEL_INFO[level], lang);
  const next = level === TOP_LEVEL ? null : LEVELS[levelIndex(level) + 1];
  const complete = progress.units.length > 0 && progress.current === null;

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('path.title')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.l }}>
        <Animated.View entering={FadeIn.duration(400)} style={{ gap: space.m }}>
          <Txt variant="title" accessibilityRole="header">
            {t('path.courseTitle', { level })}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <Pill label={`${level} ${info.name}`} tone="royal" onPress={() => router.navigate('/me')} />
            <Txt variant="caption" color="inkSoft">
              {t('path.unitsOf', { done: progress.finished, total: progress.units.length })}
            </Txt>
          </View>
          <ProgressBar value={progress.ratio} color={complete ? 'green' : 'royal'} />
          <Txt variant="body" color="inkSoft">
            {t('path.subtitle')}
          </Txt>
        </Animated.View>

        {complete ? (
          <Animated.View entering={ZoomIn.duration(380)}>
            <Paper tone="green" style={{ gap: space.m }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                <GraduationCap size={26} color={c.green} strokeWidth={2.2} />
                <Txt variant="headline" style={{ color: c.green, flex: 1 }}>
                  {t('path.levelDone', { level })}
                </Txt>
              </View>
              <Txt variant="small" color="inkSoft">
                {next ? t('path.levelDoneBody', { level }) : t('path.topLevelDone')}
              </Txt>
              {next ? (
                <Button
                  label={t('path.moveUp', { level: next })}
                  icon={ArrowUp}
                  size="medium"
                  onPress={() => {
                    haptic.success();
                    setSettings({ level: next });
                  }}
                />
              ) : null}
            </Paper>
          </Animated.View>
        ) : null}

        <Paper style={{ padding: 0, overflow: 'hidden' }}>
          {progress.units.map((u, i) => (
            <UnitRow key={u.key} unit={u} index={i} current={progress.current?.key === u.key} done={done} onPress={() => router.push(`/path/${u.key}` as never)} />
          ))}
        </Paper>

        {progress.current ? <Button label={progress.finished ? t('path.continue') : t('path.startCourse')} onPress={() => router.push(`/path/${progress.current?.key}` as never)} /> : null}

        <Txt variant="caption" color="inkFaint" style={{ marginTop: space.s }}>
          {t('path.sources')}
        </Txt>
      </ScrollView>
    </View>
  );
}
