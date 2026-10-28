// One week of the course: the goal, then the steps grouped by skill in the week's rhythm - vocabulary, grammar,
// practice, questions for the tutor, reading and listening, speaking, writing, the check. Each step opens an
// existing screen with the `path` parameter; the screen marks the step done when the learner finishes.

import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, BookOpen, BookOpenText, Check, ChevronRight, ClipboardCheck, ListChecks, MessageCircle, Mic, NotebookPen, PartyPopper, Sparkles, Users, WholeWord, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { stepLabel, stepRoute } from '@/features/path';
import { nextStep, type PathStepKind, type Skill, stepDone, stepsBySkill, unitByKey, unitsFor } from '@/harness/path';
import { useI18n } from '@/i18n';
import { localizePathUnit } from '@/i18n/content';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Button, Paper, Pill, Press, ProgressBar } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { radius, space, useTheme, type Palette } from '@/ui/theme';

const KIND: Record<PathStepKind, { icon: LucideIcon; label: string; tone: keyof Palette; tint: keyof Palette }> = {
  words: { icon: WholeWord, label: 'path.kindWords', tone: 'das', tint: 'dasTint' },
  grammar: { icon: BookOpen, label: 'path.kindGrammar', tone: 'royal', tint: 'royalTint' },
  drill: { icon: ListChecks, label: 'path.kindDrill', tone: 'der', tint: 'derTint' },
  ask: { icon: MessageCircle, label: 'path.kindAsk', tone: 'amberInk', tint: 'amberTint' },
  read: { icon: BookOpenText, label: 'path.kindRead', tone: 'green', tint: 'greenTint' },
  scene: { icon: Users, label: 'path.kindScene', tone: 'die', tint: 'dieTint' },
  ownScene: { icon: Sparkles, label: 'path.kindScene', tone: 'amberInk', tint: 'amberTint' },
  write: { icon: NotebookPen, label: 'path.kindWrite', tone: 'red', tint: 'redTint' },
  check: { icon: ClipboardCheck, label: 'path.kindCheck', tone: 'royal', tint: 'royalTint' },
  speak: { icon: Mic, label: 'path.kindSpeak', tone: 'die', tint: 'dieTint' },
};

const SKILL_LABEL: Record<Skill, string> = {
  words: 'path.skillWords',
  grammar: 'path.skillGrammar',
  drill: 'path.skillDrill',
  ask: 'path.skillAsk',
  read: 'path.skillRead',
  speak: 'path.skillSpeak',
  write: 'path.skillWrite',
  check: 'path.skillCheck',
};

export default function UnitScreen() {
  const { unit: key } = useLocalSearchParams<{ unit: string }>();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const done = useProgress((s) => s.done);
  const unit = unitByKey(key) ?? unitsFor(level)[0];
  const units = unitsFor(unit.level);
  const index = units.findIndex((u) => u.key === unit.key);
  const following = units[index + 1] ?? null;
  const shown = localizePathUnit(unit, lang);
  const next = nextStep(unit, done);
  const finished = unit.steps.filter((_, i) => stepDone(unit, i, done)).length;
  const complete = next === null;
  const groups = stepsBySkill(unit);

  // a small celebration the first time the week is seen complete, not on every visit
  const wasComplete = useRef(complete);
  useEffect(() => {
    if (complete && !wasComplete.current) haptic.success();
    wasComplete.current = complete;
  }, [complete]);

  const open = (i: number) => router.push(stepRoute(unit, i, lang, explainIn) as never);

  let row = 0;
  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('path.weekOf', { n: index + 1, total: units.length })} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.x4, gap: space.l }}>
        <Animated.View entering={FadeIn.duration(400)} style={{ gap: space.m }}>
          <De variant="display" speakable style={{ fontSize: 30, lineHeight: 36 }}>
            {unit.title_de}
          </De>
          {lang !== 'de' ? (
            <Txt variant="headline" color="inkSoft">
              {shown.title_en}
            </Txt>
          ) : null}
          <Paper tone="alt" style={{ gap: space.xs }}>
            <Txt variant="caption" color="inkSoft">
              {t('path.goalTitle')}
            </Txt>
            <Txt variant="body">{shown.goal_en}</Txt>
          </Paper>
          <ProgressBar value={unit.steps.length ? finished / unit.steps.length : 0} color={complete ? 'green' : 'royal'} />
          <Txt variant="caption" style={{ color: complete ? c.green : c.inkSoft }}>
            {complete ? t('path.unitDone') : t('path.stepsOf', { done: finished, total: unit.steps.length })}
          </Txt>
        </Animated.View>

        {complete ? (
          <Animated.View entering={ZoomIn.duration(380)}>
            <Paper tone="green" style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
              <PartyPopper size={24} color={c.green} strokeWidth={2.2} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong" style={{ color: c.green }}>
                  {t('path.unitDoneTitle')}
                </Txt>
                <Txt variant="small" color="inkSoft">
                  {following ? t('path.unitDoneBody') : t('path.lastUnitDoneBody')}
                </Txt>
              </View>
            </Paper>
          </Animated.View>
        ) : null}

        {groups.map((g) => (
          <View key={g.skill} style={{ gap: space.s }}>
            <Txt variant="caption" color="inkSoft" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: space.xs }} accessibilityRole="header">
              {t(SKILL_LABEL[g.skill])}
            </Txt>
            <Paper style={{ padding: 0, overflow: 'hidden' }}>
              {g.steps.map(({ index: i, step: s }, k) => {
                const isDone = stepDone(unit, i, done);
                const isNext = i === next;
                const { title, detail } = stepLabel(unit, i, lang);
                const kind = KIND[s.kind];
                const delay = Math.min(row++, 10) * 40;
                return (
                  <Animated.View key={`${unit.key}:${i}`} entering={FadeInDown.delay(delay).duration(320)}>
                    <Press onPress={() => open(i)} scaleTo={0.99} accessibilityLabel={isDone ? t('path.stepDoneA11y', { n: i + 1, title }) : t('path.stepA11y', { n: i + 1, title })}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 14, borderTopWidth: k ? 1 : 0, borderTopColor: c.rule, backgroundColor: isNext ? c.royalTint : undefined }}>
                        <View style={{ width: 38, height: 38, borderRadius: radius.small, backgroundColor: isDone ? c.greenTint : c[kind.tint], alignItems: 'center', justifyContent: 'center' }}>
                          {isDone ? (
                            <Animated.View entering={ZoomIn.duration(260)}>
                              <Check size={19} color={c.green} strokeWidth={2.6} />
                            </Animated.View>
                          ) : (
                            <kind.icon size={19} color={c[kind.tone]} strokeWidth={2} />
                          )}
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                            <Pill label={t(kind.label)} tone={isDone ? 'green' : isNext ? 'royal' : 'plain'} />
                            {isNext ? (
                              <Txt variant="caption" style={{ color: c.royal }}>
                                {t('path.next')}
                              </Txt>
                            ) : null}
                          </View>
                          <Txt variant="bodyStrong" style={isDone && { color: c.inkSoft }}>
                            {title}
                          </Txt>
                          {detail ? (
                            <Txt variant="small" color="inkSoft" numberOfLines={2}>
                              {detail}
                            </Txt>
                          ) : null}
                        </View>
                        <ChevronRight size={18} color={c.inkFaint} />
                      </View>
                    </Press>
                  </Animated.View>
                );
              })}
            </Paper>
          </View>
        ))}

        {complete ? (
          following ? (
            <Button label={t('path.nextUnit')} icon={ArrowRight} onPress={() => router.replace(`/path/${following.key}` as never)} />
          ) : (
            <Button label={t('path.backToCourse')} kind="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/path' as never))} />
          )
        ) : (
          <Button label={finished ? t('path.continueUnit') : t('path.startUnit')} onPress={() => open(next ?? 0)} />
        )}
      </ScrollView>
    </View>
  );
}
