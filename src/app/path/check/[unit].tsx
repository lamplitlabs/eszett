// The week's check: the typical mistakes of the week's grammar cards, one sentence at a time, to fix. A fix that
// matches the card's answer counts at once; a different sentence is shown to the tutor (when it is on the phone),
// as on the grammar card. The score closes the week; the step is marked done whatever the score.

import { router, useLocalSearchParams } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lessonKey } from '@/features/lesson';
import { checkPitfalls } from '@/features/path';
import { makeRng } from '@/harness/drills';
import { compact } from '@/harness/engines';
import { pathDoneKey, unitByKey, unitsFor, weekNumber } from '@/harness/path';
import type { CorrectionResult } from '@/harness/tutor';
import { useI18n } from '@/i18n';
import { localizeGrammar } from '@/i18n/content';
import { tutor, useModel } from '@/model/runtime';
import { fixKey, useMistakes } from '@/state/mistakes';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { Button, Paper, Pill, ProgressBar } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { Markdown } from '@/ui/Markdown';
import { RedPen } from '@/ui/RedPen';
import { RuleLines } from '@/ui/RuleLines';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

const MAX_ITEMS = 8;

const seedOf = (key: string) => [...key].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);

export default function CheckScreen() {
  const { unit: key, path, lesson } = useLocalSearchParams<{ unit: string; path?: string; lesson?: string }>();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const connection = useModel((s) => s.status);
  const record = useProgress((s) => s.record);
  const markDone = useProgress((s) => s.markDone);
  const noteMiss = useMistakes((s) => s.miss);
  const noteHit = useMistakes((s) => s.hit);
  const unit = unitByKey(key) ?? unitsFor(level)[0];
  const step = unit.steps.find((s) => s.kind === 'check');

  // the week's pitfalls in a fixed shuffle, so a retry is the same check
  const items = useMemo(() => {
    const all = checkPitfalls(step?.kind === 'check' ? step.cards : []);
    return makeRng(seedOf(unit.key)).shuffle(all).slice(0, MAX_ITEMS);
  }, [step, unit.key]);

  const [index, setIndex] = useState(0);
  const current = items[index];
  const pitfall = current?.card.pitfalls[current.index];
  const [attempt, setAttempt] = useState(pitfall?.wrong ?? '');
  const [verdict, setVerdict] = useState<{ ok: boolean; via: 'card' | 'tutor'; result?: CorrectionResult } | null>(null);
  const [checking, setChecking] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  // a sentence that was not fixed goes to the mistakes notebook; one fixed counts as a hit there, if it is in it
  const missed = () => noteMiss({ key: fixKey(current!.card.key, current!.index), kind: 'fix', text: pitfall!.wrong, right: pitfall!.right, card: current!.card.key, index: current!.index });
  const fixed = () => noteHit(fixKey(current!.card.key, current!.index));

  const check = async () => {
    if (!current || !pitfall || !attempt.trim()) return;
    if (compact(attempt) === compact(pitfall.right)) {
      haptic.success();
      setVerdict({ ok: true, via: 'card' });
      setScore((s) => s + 1);
      record('grammar', true);
      fixed();
      return;
    }
    if (compact(attempt) === compact(pitfall.wrong) || connection !== 'ready') {
      haptic.error();
      setVerdict({ ok: false, via: 'card' });
      record('grammar', false);
      missed();
      return;
    }
    setChecking(true);
    try {
      const r = await tutor.grammarCheck(attempt, current.card, { level, lang: explainIn });
      const ok = r.correction.unchanged;
      if (ok) {
        haptic.success();
        setScore((s) => s + 1);
        fixed();
      } else {
        haptic.error();
        missed();
      }
      record('grammar', ok);
      setVerdict({ ok, via: 'tutor', result: r });
    } catch {
      haptic.error();
      setVerdict({ ok: false, via: 'card' });
      record('grammar', false);
      missed();
    } finally {
      setChecking(false);
    }
  };

  const next = () => {
    const n = index + 1;
    if (n >= items.length) {
      setFinished(true);
      haptic.success();
      if (path) markDone(pathDoneKey(path));
      if (lesson !== undefined) markDone(lessonKey(Number(lesson)));
      return;
    }
    setIndex(n);
    setAttempt(items[n].card.pitfalls[items[n].index].wrong);
    setVerdict(null);
  };

  const again = () => {
    setIndex(0);
    setAttempt(items[0]?.card.pitfalls[items[0].index].wrong ?? '');
    setVerdict(null);
    setScore(0);
    setFinished(false);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/path/${unit.key}` as never));
  const shownCard = current ? localizeGrammar(current.card, lang) : null;

  return (
    <KeyboardAvoider style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('lerncheck.title', { n: weekNumber(unit) })} close onBack={close} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        {!items.length ? (
          <Paper tone="alt">
            <Txt variant="small" color="inkSoft">
              {t('lerncheck.empty')}
            </Txt>
          </Paper>
        ) : finished ? (
          <Animated.View entering={ZoomIn.duration(380)} style={{ gap: space.m }}>
            <Paper tone={score === items.length ? 'green' : score * 2 >= items.length ? 'amber' : 'red'} style={{ gap: space.xs }}>
              <Txt variant="headline" style={{ color: score === items.length ? c.green : score * 2 >= items.length ? c.amberInk : c.red }}>
                {t('lerncheck.result', { correct: score, total: items.length })}
              </Txt>
              <Txt variant="small" color="inkSoft">
                {score === items.length ? t('lerncheck.resultAll') : score * 2 >= items.length ? t('lerncheck.resultMost') : t('lerncheck.resultFew')}
              </Txt>
            </Paper>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button label={t('lerncheck.again')} kind="secondary" size="medium" grow onPress={again} />
              <Button label={t('lerncheck.backToWeek')} size="medium" grow onPress={close} />
            </View>
          </Animated.View>
        ) : current && pitfall && shownCard ? (
          <Animated.View key={index} entering={FadeIn.duration(260)} style={{ gap: space.m }}>
            <ProgressBar value={index / items.length} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s }}>
              <Txt variant="caption" color="inkSoft">
                {t('grammar.counter', { n: index + 1, total: items.length })}
              </Txt>
              <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
                <Pill label={shownCard.title_en} tone="royal" onPress={() => router.push(`/grammar/${current.card.key}`)} />
              </View>
            </View>
            <Txt variant="body" color="inkSoft">
              {t('grammar.correctIt')}
            </Txt>
            <TextInput
              value={attempt}
              onChangeText={setAttempt}
              editable={!verdict && !checking}
              multiline
              autoCorrect={false}
              autoCapitalize="sentences"
              style={{ fontFamily: font.de, fontSize: 19, lineHeight: 27, color: c.ink, backgroundColor: c.sheet, borderRadius: radius.control, borderWidth: 1, borderColor: c.rule, paddingHorizontal: space.l, paddingVertical: space.m, minHeight: 84 }}
              accessibilityLabel={t('grammar.fixTheSentence')}
            />
            {!verdict ? (
              <Button label={t('grammar.check')} onPress={() => void check()} loading={checking} disabled={!attempt.trim() || compact(attempt) === compact(pitfall.wrong)} />
            ) : (
              <Animated.View entering={FadeInDown.duration(260)} style={{ gap: space.m }}>
                <Paper tone={verdict.ok ? 'green' : 'red'} style={{ gap: space.s }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                    {verdict.ok ? <Check size={18} color={c.green} strokeWidth={2.6} /> : <X size={18} color={c.red} strokeWidth={2.6} />}
                    <Txt variant="bodyStrong" style={{ color: verdict.ok ? c.green : c.red }}>
                      {verdict.ok ? (verdict.via === 'tutor' ? t('grammar.tutorAgrees') : 'Richtig!') : t('grammar.notYet')}
                    </Txt>
                  </View>
                  <Txt variant="caption" color="inkSoft">
                    {t('grammar.answerOnCard')}
                  </Txt>
                  <De variant="germanStrong" speakable>
                    {pitfall.right}
                  </De>
                  <Txt variant="small" color="inkSoft">
                    {lang === 'de' ? pitfall.why_de : shownCard.pitfalls[current.index].why_en}
                  </Txt>
                </Paper>
                {verdict.via === 'tutor' && verdict.result && !verdict.ok ? (
                  <View style={{ gap: space.s }}>
                    <Txt variant="caption" color="inkSoft">
                      {t('grammar.tutorOnYourVersion')}
                    </Txt>
                    <RedPen original={attempt} corrected={verdict.result.correction.corrected} diff={verdict.result.diff} unchanged={verdict.result.correction.unchanged} />
                    {verdict.result.correction.explanation ? <Markdown text={verdict.result.correction.explanation} lang={explainIn} compact /> : null}
                    <RuleLines rules={verdict.result.rules} compact />
                  </View>
                ) : null}
                <Button label={index + 1 >= items.length ? t('grammar.finish') : t('grammar.nextSentence')} onPress={next} />
              </Animated.View>
            )}
          </Animated.View>
        ) : null}
      </ScrollView>
    </KeyboardAvoider>
  );
}
