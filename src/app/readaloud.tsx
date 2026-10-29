// Reading aloud: the text of a reading step, said sentence by sentence into the phone's recognizer (on the
// device, src/features/dictation.ts) and compared with the text word by word (src/harness/readAloud.ts). Each
// sentence shows the words that were not heard as written and its pace; the text ends with a score - the share
// of words heard, the clean sentences and the pace - and a weak sentence can be heard from the phone's voice and
// said again. Reached from the reading step once its text is written (`/readaloud?reading=<key>`).

import { router, useLocalSearchParams } from 'expo-router';
import { Check, Download, Headphones, Mic, Square } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDictation } from '@/features/dictation';
import { paceOf, READ_ALOUD_PASS, readAloudSentences, scoreReading, scoreSentence, type Pace, type SentenceReading } from '@/harness/readAloud';
import { storyReading } from '@/harness/stories';
import { useI18n } from '@/i18n';
import { useAuthored } from '@/state/authored';
import { useProgress } from '@/state/progress';
import { Button, Paper, ProgressBar } from '@/ui/controls';
import { PronunciationTips } from '@/ui/PronunciationTips';
import { haptic } from '@/ui/haptics';
import { TopBar } from '@/ui/Screen';
import { speak } from '@/ui/speech';
import { De, Txt } from '@/ui/Text';
import { font, gutter, space, useTheme } from '@/ui/theme';

export default function ReadAloudScreen() {
  const { reading: key } = useLocalSearchParams<{ reading: string }>();
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const kept = useAuthored((s) => s.readings[key]);
  // a kept text from the course, or a part of a story from the pack (src/harness/stories.ts)
  const saved = kept ?? storyReading(key);
  const record = useProgress((s) => s.record);
  const sentences = useMemo(() => readAloudSentences(saved?.text ?? ''), [saved?.text]);

  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<(SentenceReading | null)[]>(() => sentences.map(() => null));
  const [heard, setHeard] = useState('');
  const [finished, setFinished] = useState(false);
  const startedAt = useRef(0);
  const current = sentences[index];

  const dictation = useDictation({
    contextualStrings: current ? current.text.split(/\s+/) : undefined,
    onInterim: setHeard,
    onFinal: (text) => {
      if (!current) return;
      setHeard(text);
      const r = scoreSentence(current.text, text, Date.now() - startedAt.current);
      setResults((v) => v.map((x, i) => (i === index ? r : x)));
      if (r.clear) haptic.success();
      else haptic.error();
      record('speaking', r.clear);
    },
  });

  const start = () => {
    startedAt.current = Date.now();
    setHeard('');
    void dictation.start();
  };
  const result = results[index];
  const score = scoreReading(results, sentences);

  const next = () => {
    dictation.abort();
    setHeard('');
    if (index + 1 >= sentences.length) {
      setFinished(true);
      haptic.success();
    } else setIndex(index + 1);
  };
  const again = () => {
    setResults(sentences.map(() => null));
    setIndex(0);
    setFinished(false);
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace('/' as never));

  const paceText = (wpm: number | null, pace: Pace | null = paceOf(wpm)) =>
    wpm === null || !pace ? null : t(pace === 'slow' ? 'readAloud.paceSlow' : pace === 'fast' ? 'readAloud.paceFast' : 'readAloud.paceSteady', { wpm });

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('readAloud.title')} close onBack={close} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        {!saved || !sentences.length ? (
          <Paper tone="alt">
            <Txt variant="small" color="inkSoft">
              {t('readAloud.noText')}
            </Txt>
          </Paper>
        ) : finished ? (
          <Animated.View entering={ZoomIn.duration(380)} style={{ gap: space.m }}>
            <Paper tone={score.accuracy >= READ_ALOUD_PASS ? 'green' : 'amber'} style={{ gap: space.xs }}>
              <Txt variant="headline" style={{ color: score.accuracy >= READ_ALOUD_PASS ? c.green : c.amberInk }}>
                {t('readAloud.score', { percent: Math.round(score.accuracy * 100) })}
              </Txt>
              <Txt variant="small" color="inkSoft">
                {t('readAloud.cleanSentences', { clean: score.clean, total: score.total })}
                {paceText(score.wpm, score.pace) ? ` · ${paceText(score.wpm, score.pace)}` : ''}
              </Txt>
              <Txt variant="small" color="inkSoft">
                {score.accuracy >= READ_ALOUD_PASS ? t('readAloud.scoreGood') : t('readAloud.scoreWork')}
              </Txt>
            </Paper>
            {results.some((r) => r && !r.words.every((w) => w.ok)) ? (
              <Paper style={{ gap: space.s }}>
                <Txt variant="caption" color="inkSoft">
                  {t('readAloud.missedWords')}
                </Txt>
                <Text style={{ fontFamily: font.de, fontSize: 18, lineHeight: 27, color: c.ink }}>
                  {Array.from(new Set(results.flatMap((r) => (r ? r.words.filter((w) => !w.ok).map((w) => w.word.replace(/[.,;:!?„“”"]/g, '')) : [])))).join(' · ')}
                </Text>
              </Paper>
            ) : null}
            <PronunciationTips missed={results.flatMap((r) => (r ? r.words.filter((w) => !w.ok).map((w) => w.word) : []))} />
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button label={t('readAloud.again')} kind="secondary" size="medium" grow onPress={again} />
              <Button label={t('common.done')} size="medium" grow onPress={close} />
            </View>
          </Animated.View>
        ) : current ? (
          <Animated.View key={index} entering={FadeIn.duration(240)} style={{ gap: space.m }}>
            <ProgressBar value={index / sentences.length} />
            <Txt variant="caption" color="inkSoft">
              {t('grammar.counter', { n: index + 1, total: sentences.length })} · {saved.title}
            </Txt>
            <Txt variant="body" color="inkSoft">
              {t('readAloud.intro')}
            </Txt>
            <Paper style={{ gap: space.m }}>
              {result ? (
                <Text style={{ fontFamily: font.deSemi, fontSize: 22, lineHeight: 32 }}>
                  {result.words.map((w, i) => (
                    <Text key={i} style={{ color: w.ok ? c.green : c.red, textDecorationLine: w.ok ? 'none' : 'underline' }}>
                      {w.word}{' '}
                    </Text>
                  ))}
                </Text>
              ) : (
                <De variant="germanLarge">{current.text}</De>
              )}
            </Paper>

            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button label={t('read.listen')} icon={Headphones} kind="secondary" size="medium" grow onPress={() => void speak(current.text)} />
              {dictation.available ? (
                dictation.listening ? (
                  <Button label={t('speak.stop')} icon={Square} kind="pen" size="medium" grow onPress={dictation.stop} />
                ) : (
                  <Button label={result ? t('speak.sayAgain') : t('readAloud.read')} icon={Mic} size="medium" grow onPress={start} />
                )
              ) : null}
            </View>

            {dictation.listening ? (
              <Paper tone="red" style={{ gap: space.xs }}>
                <Txt variant="caption" style={{ color: c.red }}>
                  {t('speak.listening')}
                </Txt>
                {heard ? <Text style={{ fontFamily: font.de, fontSize: 18, lineHeight: 26, color: c.ink }}>{heard}</Text> : null}
              </Paper>
            ) : null}

            {dictation.error && dictation.error !== 'not-allowed' && !result ? (
              <Txt variant="small" style={{ color: c.red }}>
                {dictation.error === 'no-speech' || dictation.error === 'speech-timeout' ? t('speak.nothingHeard') : t('speak.recognizerError')}
              </Txt>
            ) : null}

            {result ? (
              <Animated.View entering={FadeInDown.duration(260)} style={{ gap: space.m }}>
                <Paper tone={result.words.every((w) => w.ok) ? 'green' : 'amber'} style={{ gap: space.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                    {result.words.every((w) => w.ok) ? <Check size={18} color={c.green} strokeWidth={2.6} /> : null}
                    <Txt variant="bodyStrong" style={{ color: result.words.every((w) => w.ok) ? c.green : c.amberInk }}>
                      {result.words.every((w) => w.ok) ? t('readAloud.allHeard') : t('speak.notClear', { count: result.words.filter((w) => !w.ok).length })}
                    </Txt>
                  </View>
                  {paceText(result.wpm) ? (
                    <Txt variant="small" color="inkSoft">
                      {paceText(result.wpm)}
                    </Txt>
                  ) : null}
                </Paper>
                <PronunciationTips missed={result.words.filter((w) => !w.ok).map((w) => w.word)} max={2} />
                <Button label={index + 1 >= sentences.length ? t('grammar.finish') : t('common.next')} onPress={next} />
              </Animated.View>
            ) : null}

            {!dictation.available ? (
              <Paper tone="alt" style={{ gap: space.m }}>
                <Txt variant="small" color="inkSoft">
                  {dictation.reason === 'offline-pack' ? t('speak.offlinePack') : dictation.reason === 'permission' ? t('speak.permission') : t('speak.unavailable')}
                </Txt>
                {dictation.downloadOfflinePack ? <Button label={t('speak.downloadPack')} icon={Download} kind="secondary" size="medium" onPress={() => void dictation.downloadOfflinePack?.()} /> : null}
                <Button label={index + 1 >= sentences.length ? t('grammar.finish') : t('common.next')} kind="secondary" size="medium" onPress={next} />
              </Paper>
            ) : null}
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}
