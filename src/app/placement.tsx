// The placement test (src/harness/placement.ts): four quick items per level, from A1 upwards, until a level is too
// hard - two meanings, an article and a verb form, the app's own drills, checked by code. The result is a level
// to start at; the learner takes it or chooses one themselves. Nothing is written to the progress store, so the
// test can be taken again. Reached from onboarding ("Not sure?") and from Me › Your level.

import { router, useLocalSearchParams } from 'expo-router';
import { Check, GraduationCap } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkDrill, makeRng, type Drill, type DrillResult } from '@/harness/drills';
import { LEVEL_INFO } from '@/harness/levels';
import { buildPlacement, PASS_MARK, PLACEMENT_LEVELS, placementOutcome, ROUND_SIZE } from '@/harness/placement';
import { useI18n } from '@/i18n';
import { localizeLevel, wordMeaning } from '@/i18n/content';
import { coreLexicon, tutor } from '@/model/runtime';
import { useSettings } from '@/state/settings';
import { Button, Paper, ProgressBar } from '@/ui/controls';
import { ArticleButtons, Choices } from '@/ui/DrillAnswer';
import { haptic } from '@/ui/haptics';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

export default function PlacementScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const set = useSettings((s) => s.set);
  const [seed, setSeed] = useState(() => Date.now());
  const { rounds, lemmaByMeaning } = useMemo(() => {
    const lex = tutor.lexicon ?? coreLexicon;
    const byMeaning = new Map<string, string>();
    for (const n of lex.nouns) if (n.meaning && !byMeaning.has(n.meaning)) byMeaning.set(n.meaning, n.lemma);
    return { rounds: buildPlacement(lex, makeRng(seed)), lemmaByMeaning: byMeaning };
  }, [seed]);

  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(0);
  const [item, setItem] = useState(0);
  const [correct, setCorrect] = useState<number[]>(() => rounds.map(() => 0));
  const [given, setGiven] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<DrillResult | null>(null);
  const [done, setDone] = useState(false);

  const current = rounds[round];
  const drill: Drill | undefined = current?.drills[item];
  const answered = rounds.slice(0, round + 1).map((r, i) => ({ level: r.level, correct: correct[i] }));
  const outcome = placementOutcome(done ? answered : []);
  const info = localizeLevel(LEVEL_INFO[outcome.level], lang);
  const total = PLACEMENT_LEVELS.length * ROUND_SIZE;
  const answeredCount = round * ROUND_SIZE + item;

  const meaningLabel = (d: Drill, meaning: string) => {
    const lemma = d.noun?.meaning === meaning ? d.noun.lemma : lemmaByMeaning.get(meaning);
    return lemma ? wordMeaning(lemma, meaning, lang) : meaning;
  };
  const sub = !drill?.sub || drill.category === 'meaning' ? null : drill.noun ? wordMeaning(drill.noun.lemma, drill.sub, lang) : drill.verb ? wordMeaning(drill.verb.infinitive, drill.sub, lang) : drill.sub;

  const submit = (answer: string) => {
    if (!drill || result) return;
    const r = checkDrill(drill, answer);
    if (r.digits) {
      setResult(r);
      return;
    }
    setResult(r);
    if (r.ok) {
      haptic.success();
      setCorrect((v) => v.map((n, i) => (i === round ? n + 1 : n)));
    } else haptic.error();
  };

  const next = () => {
    const score = correct[round];
    const lastItem = item + 1 >= ROUND_SIZE;
    setResult(null);
    setPicked(null);
    setGiven('');
    if (!lastItem) {
      setItem(item + 1);
      return;
    }
    // a round that is too hard ends the test; the last round ends it too
    if (score < PASS_MARK || round + 1 >= rounds.length) {
      setDone(true);
      haptic.success();
      return;
    }
    setRound(round + 1);
    setItem(0);
  };

  const restart = () => {
    setSeed(Date.now());
    setRound(0);
    setItem(0);
    setCorrect(rounds.map(() => 0));
    setResult(null);
    setPicked(null);
    setGiven('');
    setDone(false);
    setStarted(true);
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace((from === 'onboarding' ? '/onboarding' : '/(tabs)/me') as never));
  const take = () => {
    set({ level: outcome.level });
    leave();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('placement.title')} close onBack={leave} />
      <KeyboardAvoider>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
          {!started ? (
            <Animated.View entering={FadeInDown.duration(300)} style={{ gap: space.l }}>
              <Txt variant="title">{t('onboarding.levelTitle')}</Txt>
              <Txt variant="body" color="inkSoft">
                {t('placement.intro', { count: ROUND_SIZE })}
              </Txt>
              <Button label={t('placement.start')} onPress={() => setStarted(true)} />
            </Animated.View>
          ) : done ? (
            <Animated.View entering={ZoomIn.duration(380)} style={{ gap: space.m }}>
              <Paper tone="green" style={{ gap: space.m }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                  <GraduationCap size={26} color={c.green} strokeWidth={2.2} />
                  <Txt variant="headline" style={{ color: c.green, flex: 1 }}>
                    {t('placement.result', { level: outcome.level })}
                  </Txt>
                </View>
                <Txt variant="bodyStrong">{info.name}</Txt>
                <Txt variant="small" color="inkSoft">
                  {info.canDo}
                </Txt>
                <Txt variant="small" color="inkSoft">
                  {outcome.stoppedAt ? t('placement.stoppedAt', { level: outcome.stoppedAt, correct: correct[round], total: ROUND_SIZE }) : t('placement.passedAll')}
                </Txt>
              </Paper>
              <Button label={t('placement.take', { level: outcome.level })} icon={Check} onPress={take} />
              <View style={{ flexDirection: 'row', gap: space.s }}>
                <Button label={t('placement.again')} kind="secondary" size="medium" grow onPress={restart} />
                <Button label={t('placement.choose')} kind="secondary" size="medium" grow onPress={leave} />
              </View>
            </Animated.View>
          ) : drill && current ? (
            <Animated.View key={`${round}-${item}`} entering={FadeIn.duration(220)} style={{ gap: space.m }}>
              <ProgressBar value={answeredCount / total} />
              <Txt variant="caption" color="inkSoft">
                {t('placement.round', { level: current.level, n: item + 1, total: ROUND_SIZE })}
              </Txt>
              <Txt variant="body" color="inkSoft">
                {drill.instruction}
              </Txt>
              <Paper style={{ gap: space.xs }}>
                <De variant="germanLarge">{drill.cue}</De>
                {sub ? (
                  <Txt variant="body" color="inkSoft">
                    {sub}
                  </Txt>
                ) : null}
                {drill.category === 'meaning' && drill.sub ? (
                  <De variant="german" italic style={{ color: c.inkSoft }}>
                    {drill.sub}
                  </De>
                ) : null}
              </Paper>

              {drill.mode === 'articles' ? (
                <ArticleButtons
                  drill={drill}
                  picked={picked}
                  onPick={(a) => {
                    setPicked(a);
                    submit(a);
                  }}
                />
              ) : null}
              {drill.mode === 'choice' ? (
                <Choices
                  drill={drill}
                  picked={picked}
                  label={(o) => meaningLabel(drill, o)}
                  onPick={(a) => {
                    setPicked(a);
                    submit(a);
                  }}
                />
              ) : null}
              {drill.mode === 'text' ? (
                <View style={{ gap: space.m }}>
                  <TextInput
                    value={given}
                    onChangeText={(x) => {
                      setGiven(x);
                      if (result?.digits) setResult(null);
                    }}
                    editable={!result || Boolean(result.digits)}
                    autoFocus
                    autoCorrect={false}
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={t('drill.answerPlaceholder')}
                    placeholderTextColor={c.inkFaint}
                    returnKeyType="done"
                    onSubmitEditing={() => given.trim() && submit(given)}
                    accessibilityLabel={t('drill.answerPlaceholder')}
                    style={{ fontFamily: font.de, fontSize: 22, color: c.royal, backgroundColor: c.sheet, borderRadius: radius.control, borderWidth: 1.5, borderColor: result && !result.ok && !result.digits ? c.red : result?.ok ? c.green : c.rule, paddingHorizontal: space.l, paddingVertical: space.m }}
                  />
                  {!result || result.digits ? <Button label={t('grammar.check')} onPress={() => submit(given)} disabled={!given.trim()} /> : null}
                </View>
              ) : null}

              {result && !result.digits ? (
                <Animated.View entering={FadeInDown.duration(220)} style={{ gap: space.m }}>
                  <Paper tone={result.ok ? 'green' : 'red'} style={{ gap: space.xs }}>
                    <Txt variant="bodyStrong" style={{ color: result.ok ? c.green : c.red }}>
                      {result.ok ? t('drill.right') : t('drill.notQuite')}
                    </Txt>
                    {!result.ok ? <De variant="german">{drill.category === 'meaning' ? meaningLabel(drill, drill.answer) : drill.answer}</De> : null}
                  </Paper>
                  <Button label={t('common.next')} onPress={next} />
                </Animated.View>
              ) : null}
            </Animated.View>
          ) : null}
        </ScrollView>
      </KeyboardAvoider>
    </View>
  );
}
