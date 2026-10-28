// Listening: a dictation of the week's scenes - what the other person says (the opening line, then each reply),
// or the grammar cards' examples in a week without a scene (src/features/path.ts listenSentences). The phone's
// German voice reads a sentence, as often and as slowly as the learner likes; the learner writes what they heard,
// and the app compares the two word by word the way the Sprechen step does (src/harness/speaking.ts), then shows
// the sentence with the words that were missed underlined. A phone without a German voice is told what to install.

import { router, useLocalSearchParams } from 'expo-router';
import { Check, Headphones, Settings2, Snail } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lessonKey } from '@/features/lesson';
import { listenSentences } from '@/features/path';
import { pathDoneKey, unitByKey, unitsFor, weekNumber } from '@/harness/path';
import { compareSpoken, type SpokenComparison } from '@/harness/speaking';
import { useI18n } from '@/i18n';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Button, Paper, Pill, ProgressBar } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { TopBar } from '@/ui/Screen';
import { onSpeechError, openSpeechSettings, speak, stopSpeaking } from '@/ui/speech';
import { Txt } from '@/ui/Text';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

/** The slow reading, for a second listen: the learner's usual rate, a quarter slower. */
const SLOW = 0.72;

export default function ListenScreen() {
  const { unit: key, path, lesson } = useLocalSearchParams<{ unit: string; path?: string; lesson?: string }>();
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const speechRate = useSettings((s) => s.speechRate);
  const record = useProgress((s) => s.record);
  const markDone = useProgress((s) => s.markDone);
  const unit = unitByKey(key) ?? unitsFor(level)[0];
  const items = useMemo(() => {
    const step = unit.steps.find((s) => s.kind === 'listen');
    return listenSentences(step?.kind === 'listen' ? step : { scenes: [], cards: [] });
  }, [unit]);

  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<SpokenComparison | null>(null);
  const [right, setRight] = useState<boolean[]>(() => items.map(() => false));
  const [finished, setFinished] = useState(false);
  const [voiceFailed, setVoiceFailed] = useState(false);
  const current = items[index];

  useEffect(() => onSpeechError(() => setVoiceFailed(true)), []);
  useEffect(() => () => stopSpeaking(), []);

  const check = () => {
    if (!current || !typed.trim()) return;
    stopSpeaking();
    const r = compareSpoken(current.text, typed);
    // written, not spoken: a dictation counts when every word is there (the Sprechen step allows a recognizer's slips)
    const exact = r.words.every((w) => w.ok);
    setResult(r);
    if (exact) haptic.success();
    else haptic.error();
    record('listening', exact);
    if (exact) setRight((v) => v.map((x, i) => (i === index ? true : x)));
  };

  const finish = () => {
    setFinished(true);
    haptic.success();
    if (path) markDone(pathDoneKey(path));
    if (lesson !== undefined) markDone(lessonKey(Number(lesson)));
  };

  const next = () => {
    setResult(null);
    setTyped('');
    if (index + 1 >= items.length) finish();
    else setIndex(index + 1);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/path/${unit.key}` as never));
  const rightCount = right.filter(Boolean).length;
  const exact = result ? result.words.every((w) => w.ok) : false;

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('listen.title', { n: weekNumber(unit) })} close onBack={close} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        {!items.length ? (
          <Paper tone="alt">
            <Txt variant="small" color="inkSoft">
              {t('speak.empty')}
            </Txt>
          </Paper>
        ) : finished ? (
          <Animated.View entering={ZoomIn.duration(380)} style={{ gap: space.m }}>
            <Paper tone={rightCount === items.length ? 'green' : 'amber'} style={{ gap: space.xs }}>
              <Txt variant="headline" style={{ color: rightCount === items.length ? c.green : c.amberInk }}>
                {t('listen.score', { right: rightCount, total: items.length })}
              </Txt>
              <Txt variant="small" color="inkSoft">
                {rightCount === items.length ? t('listen.scoreAll') : t('listen.scoreSome')}
              </Txt>
            </Paper>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button
                label={t('listen.again')}
                kind="secondary"
                size="medium"
                grow
                onPress={() => {
                  setIndex(0);
                  setRight(items.map(() => false));
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
              {t('listen.intro')}
            </Txt>

            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button label={t('read.listen')} icon={Headphones} size="medium" grow onPress={() => void speak(current.text, { rate: speechRate })} />
              <Button label={t('listen.slower')} icon={Snail} kind="secondary" size="medium" grow onPress={() => void speak(current.text, { rate: Math.min(speechRate, SLOW) })} />
            </View>

            {voiceFailed ? (
              <Paper tone="amber" style={{ gap: space.m }}>
                <Txt variant="small" style={{ color: c.amberInk }}>
                  {t('speech.noVoice')}
                </Txt>
                <Button label={t('speech.openSettings')} icon={Settings2} kind="secondary" size="medium" onPress={() => void openSpeechSettings()} />
              </Paper>
            ) : null}

            {result ? (
              <Animated.View entering={FadeInDown.duration(260)} style={{ gap: space.m }}>
                <Paper style={{ gap: space.m }}>
                  <Text style={{ fontFamily: font.deSemi, fontSize: 24, lineHeight: 34 }}>
                    {result.words.map((w, i) => (
                      <Text key={i} style={{ color: w.ok ? c.green : c.red, textDecorationLine: w.ok ? 'none' : 'underline' }}>
                        {w.word}{' '}
                      </Text>
                    ))}
                  </Text>
                  {current.gloss ? (
                    <Txt variant="small" color="inkSoft">
                      {current.gloss}
                    </Txt>
                  ) : null}
                </Paper>
                <Paper tone={exact ? 'green' : 'amber'} style={{ gap: space.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                    {exact ? (
                      <Animated.View entering={ZoomIn.duration(220)}>
                        <Check size={18} color={c.green} strokeWidth={2.6} />
                      </Animated.View>
                    ) : null}
                    <Txt variant="bodyStrong" style={{ color: exact ? c.green : c.amberInk }}>
                      {exact ? t('listen.right') : t('listen.missed', { count: result.words.filter((w) => !w.ok).length })}
                    </Txt>
                  </View>
                  <Txt variant="small" color="inkSoft">
                    {t('listen.youWrote', { text: typed.trim() })}
                  </Txt>
                </Paper>
                <Button label={index + 1 >= items.length ? t('grammar.finish') : t('common.next')} onPress={next} />
              </Animated.View>
            ) : (
              <View style={{ gap: space.m }}>
                <TextInput
                  value={typed}
                  onChangeText={setTyped}
                  multiline
                  autoCorrect={false}
                  autoCapitalize="sentences"
                  placeholder={t('listen.placeholder')}
                  placeholderTextColor={c.inkFaint}
                  style={{ fontFamily: font.de, fontSize: 19, lineHeight: 27, color: c.ink, backgroundColor: c.sheet, borderRadius: radius.control, borderWidth: 1, borderColor: c.rule, paddingHorizontal: space.l, paddingVertical: space.m, minHeight: 84 }}
                  accessibilityLabel={t('listen.placeholder')}
                />
                <Button label={t('grammar.check')} onPress={check} disabled={!typed.trim()} />
              </View>
            )}
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}
