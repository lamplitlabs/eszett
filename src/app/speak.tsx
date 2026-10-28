// Speaking: the week's sentences to listen to and say - the lines the learner speaks in the week's scenes and the
// grammar cards' examples (src/features/path.ts speakSentences). The phone's German voice reads a sentence, the
// learner says it, the phone's own recognizer (on the device, src/features/dictation.ts) writes down what it
// heard, and the app compares the two word by word (src/harness/speaking.ts). Without a usable recognizer the
// step is listen-and-repeat, marked by hand.

import { router, useLocalSearchParams } from 'expo-router';
import { Check, Download, Headphones, Mic, Square } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDictation } from '@/features/dictation';
import { lessonKey } from '@/features/lesson';
import { speakSentences } from '@/features/path';
import { pathDoneKey, unitByKey, unitsFor, weekNumber } from '@/harness/path';
import { compareSpoken, type SpokenComparison } from '@/harness/speaking';
import { useI18n } from '@/i18n';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Button, Paper, Pill, Press, ProgressBar } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { TopBar } from '@/ui/Screen';
import { speak } from '@/ui/speech';
import { De, Txt } from '@/ui/Text';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

export default function SpeakScreen() {
  const { unit: key, path, lesson } = useLocalSearchParams<{ unit: string; path?: string; lesson?: string }>();
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const record = useProgress((s) => s.record);
  const markDone = useProgress((s) => s.markDone);
  const unit = unitByKey(key) ?? unitsFor(level)[0];
  // the sentences are fixed per week (bundled content), so the list is built once per unit
  const items = useMemo(() => {
    const step = unit.steps.find((s) => s.kind === 'speak');
    return speakSentences(step?.kind === 'speak' ? step : { scenes: [], cards: [] });
  }, [unit]);

  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<SpokenComparison | null>(null);
  const [heard, setHeard] = useState('');
  const [clear, setClear] = useState<boolean[]>(() => items.map(() => false));
  const [finished, setFinished] = useState(false);
  const current = items[index];

  const dictation = useDictation({
    contextualStrings: current ? current.text.split(/\s+/) : undefined,
    onInterim: setHeard,
    onFinal: (text) => {
      if (!current) return;
      setHeard(text);
      const r = compareSpoken(current.text, text);
      setResult(r);
      if (r.clear) haptic.success();
      else haptic.error();
      record('speaking', r.clear);
      if (r.clear) setClear((v) => v.map((x, i) => (i === index ? true : x)));
    },
  });

  const finish = () => {
    setFinished(true);
    haptic.success();
    if (path) markDone(pathDoneKey(path));
    if (lesson !== undefined) markDone(lessonKey(Number(lesson)));
  };

  const next = () => {
    dictation.abort();
    setResult(null);
    setHeard('');
    if (index + 1 >= items.length) finish();
    else setIndex(index + 1);
  };

  const practised = () => {
    setClear((v) => v.map((x, i) => (i === index ? true : x)));
    record('speaking');
    next();
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/path/${unit.key}` as never));
  const clearCount = clear.filter(Boolean).length;

  const reasonText =
    dictation.reason === 'offline-pack'
      ? t('speak.offlinePack')
      : dictation.reason === 'permission'
        ? t('speak.permission')
        : dictation.reason
          ? t('speak.unavailable')
          : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('speak.title', { n: weekNumber(unit) })} close onBack={close} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        {!items.length ? (
          <Paper tone="alt">
            <Txt variant="small" color="inkSoft">
              {t('speak.empty')}
            </Txt>
          </Paper>
        ) : finished ? (
          <Animated.View entering={ZoomIn.duration(380)} style={{ gap: space.m }}>
            <Paper tone={clearCount === items.length ? 'green' : 'amber'} style={{ gap: space.xs }}>
              <Txt variant="headline" style={{ color: clearCount === items.length ? c.green : c.amberInk }}>
                {t('speak.score', { clear: clearCount, total: items.length })}
              </Txt>
              <Txt variant="small" color="inkSoft">
                {clearCount === items.length ? t('speak.scoreAll') : t('speak.scoreSome')}
              </Txt>
            </Paper>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button
                label={t('speak.again')}
                kind="secondary"
                size="medium"
                grow
                onPress={() => {
                  setIndex(0);
                  setClear(items.map(() => false));
                  setFinished(false);
                }}
              />
              <Button label={t('path.backToCourse')} size="medium" grow onPress={close} />
            </View>
          </Animated.View>
        ) : current ? (
          <Animated.View key={index} entering={FadeIn.duration(260)} style={{ gap: space.m }}>
            <ProgressBar value={index / items.length} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s }}>
              <Txt variant="caption" color="inkSoft">
                {t('grammar.counter', { n: index + 1, total: items.length })}
              </Txt>
              <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
                {current.source.kind === 'scene' ? (
                  <Pill label={current.source.situation.replace(/^./, (ch) => ch.toUpperCase())} tone="royal" onPress={() => router.push(`/scene/${current.source.key}`)} />
                ) : (
                  <Pill label={t('path.kindGrammar')} tone="royal" onPress={() => router.push(`/grammar/${current.source.key}`)} />
                )}
              </View>
            </View>
            <Txt variant="body" color="inkSoft">
              {t('speak.intro')}
            </Txt>

            <Paper style={{ gap: space.m }}>
              {result ? (
                <Text style={{ fontFamily: font.deSemi, fontSize: 24, lineHeight: 34 }}>
                  {result.words.map((w, i) => (
                    <Text key={i} style={{ color: w.ok ? c.green : c.red, textDecorationLine: w.ok ? 'none' : 'underline' }}>
                      {w.word}{' '}
                    </Text>
                  ))}
                </Text>
              ) : (
                <De variant="germanLarge" speakable>
                  {current.text}
                </De>
              )}
              {current.gloss ? (
                <Txt variant="small" color="inkSoft">
                  {current.gloss}
                </Txt>
              ) : null}
            </Paper>

            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button label={t('read.listen')} icon={Headphones} kind="secondary" size="medium" grow onPress={() => void speak(current.text)} />
              {dictation.available ? (
                dictation.listening ? (
                  <Button label={t('speak.stop')} icon={Square} kind="pen" size="medium" grow onPress={dictation.stop} />
                ) : (
                  <Button label={t('speak.speak')} icon={Mic} size="medium" grow onPress={() => void dictation.start()} />
                )
              ) : null}
            </View>

            {dictation.listening ? (
              <Paper tone="red" style={{ gap: space.xs }}>
                <Txt variant="caption" style={{ color: c.red }}>
                  {t('speak.listening')}
                </Txt>
                {heard ? (
                  <Text style={{ fontFamily: font.de, fontSize: 18, lineHeight: 26, color: c.ink }}>{heard}</Text>
                ) : null}
              </Paper>
            ) : null}

            {dictation.error && dictation.error !== 'not-allowed' && !result ? (
              <Txt variant="small" style={{ color: c.red }}>
                {dictation.error === 'no-speech' || dictation.error === 'speech-timeout' ? t('speak.nothingHeard') : t('speak.recognizerError')}
              </Txt>
            ) : null}

            {result ? (
              <Animated.View entering={FadeInDown.duration(260)} style={{ gap: space.m }}>
                <Paper tone={result.clear ? 'green' : 'amber'} style={{ gap: space.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                    {result.clear ? (
                      <Animated.View entering={ZoomIn.duration(220)}>
                        <Check size={18} color={c.green} strokeWidth={2.6} />
                      </Animated.View>
                    ) : null}
                    <Txt variant="bodyStrong" style={{ color: result.clear ? c.green : c.amberInk }}>
                      {result.clear ? t('speak.clear') : t('speak.notClear', { count: result.words.filter((w) => !w.ok).length })}
                    </Txt>
                  </View>
                  <Txt variant="small" color="inkSoft">
                    {t('speak.heard', { text: heard })}
                  </Txt>
                </Paper>
                <View style={{ flexDirection: 'row', gap: space.s }}>
                  <Button
                    label={t('speak.sayAgain')}
                    icon={Mic}
                    kind="secondary"
                    size="medium"
                    grow
                    onPress={() => {
                      setResult(null);
                      setHeard('');
                      void dictation.start();
                    }}
                  />
                  <Button label={index + 1 >= items.length ? t('grammar.finish') : t('common.next')} size="medium" grow onPress={next} />
                </View>
              </Animated.View>
            ) : null}

            {!dictation.available ? (
              <Paper tone="alt" style={{ gap: space.m }}>
                <Txt variant="small" color="inkSoft">
                  {reasonText}
                </Txt>
                {dictation.downloadOfflinePack ? <Button label={t('speak.downloadPack')} icon={Download} kind="secondary" size="medium" onPress={() => void dictation.downloadOfflinePack?.()} /> : null}
                <Press onPress={practised} accessibilityLabel={t('speak.practised')} style={{ alignSelf: 'flex-start' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, backgroundColor: c.royal, borderRadius: radius.control, paddingHorizontal: space.l, paddingVertical: 10 }}>
                    <Check size={16} color={c.onRoyal} strokeWidth={2.6} />
                    <Txt variant="smallStrong" style={{ color: c.onRoyal }}>
                      {t('speak.practised')}
                    </Txt>
                  </View>
                </Press>
              </Paper>
            ) : null}
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}
