// Reading and listening: the tutor writes a short German text on the topic at the learner's level, with three
// multiple-choice questions (src/harness/reading.ts). The text stays hidden at first so the learner can listen
// to it (the device's German voice) before reading it; every word of the text opens the word sheet; the
// questions are checked by the app. The text is kept (src/state/authored.ts), so the step opens again at once
// and "another text" is the learner's choice. Reached from the course (`/read?topic=…&path=…`).

import { router, useLocalSearchParams } from 'expo-router';
import { Check, Eye, EyeOff, Headphones, RefreshCw, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lessonKey } from '@/features/lesson';
import { notReadyNote, useModelPercent } from '@/features/modelStatus';
import { wordTopicLabel } from '@/features/topics';
import { pathDoneKey } from '@/harness/path';
import { readingWordsSoFar, type ReadingDraft } from '@/harness/reading';
import type { AnswerChecks } from '@/harness/verify';
import { useI18n } from '@/i18n';
import { describeError, tutor, useModel } from '@/model/runtime';
import { useAuthored } from '@/state/authored';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { CheckFooter } from '@/ui/CheckFooter';
import { Button, Paper, Press } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { TopBar } from '@/ui/Screen';
import { onSpeaking, speak, stopSpeaking } from '@/ui/speech';
import { De, Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

type Draft = ReadingDraft & { checks: AnswerChecks };

/** The text, every word a tap away from the word sheet. */
function TappableText({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.m }}>
      {text.split(/\n\s*\n/).map((para, p) => (
        <Text key={p} style={{ fontFamily: font.de, fontSize: 19, lineHeight: 30, color: c.ink }}>
          {para.split(/(\s+)/).map((piece, i) => {
            if (!piece.trim()) return piece;
            const lemma = piece.replace(/^[„“"'(«»]+|[“”"'.,;:!?)«»…]+$/g, '');
            if (!lemma) return piece;
            return (
              <Text key={i} onPress={() => router.push(`/word/${encodeURIComponent(lemma)}`)} suppressHighlighting>
                {piece}
              </Text>
            );
          })}
        </Text>
      ))}
    </View>
  );
}

export default function ReadScreen() {
  const params = useLocalSearchParams<{ topic?: string; path?: string; lesson?: string }>();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const connection = useModel((s) => s.status);
  const pct = useModelPercent();
  const record = useProgress((s) => s.record);
  const markDone = useProgress((s) => s.markDone);
  const topic = params.topic ?? 'the family';
  // the text written last time for this step (or this topic at this level), shown again instead of a new one
  const readingKey = params.path ?? `${level}:${topic}`;
  const saved = useAuthored((s) => s.readings[readingKey]);
  const addReading = useAuthored((s) => s.addReading);

  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>(() => (saved ? 'done' : 'idle'));
  const [draft, setDraft] = useState<Draft | null>(() => saved ?? null);
  const [error, setError] = useState('');
  const [wordsSoFar, setWordsSoFar] = useState(0);
  const [shownText, setShownText] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [picked, setPicked] = useState<(number | null)[]>(() => (saved ? saved.questions.map(() => null) : []));
  const finishedRef = useRef(false);

  useEffect(() => onSpeaking((now) => setSpeaking(now !== null)), []);
  useEffect(() => () => stopSpeaking(), []);

  const fetchText = useCallback(async () => {
    setStatus('running');
    setDraft(null);
    setShownText(false);
    setPicked([]);
    setWordsSoFar(0);
    finishedRef.current = false;
    try {
      const r = await tutor.readingText(wordTopicLabel(topic, 'en'), {
        level,
        lang: explainIn,
        onText: (full) => setWordsSoFar(readingWordsSoFar(full)),
      });
      setDraft(r);
      setPicked(r.questions.map(() => null));
      setStatus('done');
      addReading(readingKey, { title: r.title, text: r.text, questions: r.questions, checks: r.checks, level, topic, generated: true, created: Date.now() });
    } catch (e) {
      setError(describeError(e));
      setStatus('error');
    }
  }, [addReading, explainIn, level, readingKey, topic]);

  // the first text starts by itself once the tutor is reachable; a kept text needs no writing
  const autoStarted = useRef(Boolean(saved));
  useEffect(() => {
    if (connection !== 'ready' || autoStarted.current) return;
    autoStarted.current = true;
    void fetchText();
  }, [connection, fetchText]);

  const answered = picked.filter((p) => p !== null).length;
  const correct = draft ? picked.filter((p, i) => p === draft.questions[i].answer).length : 0;
  const allAnswered = draft !== null && answered === draft.questions.length;

  useEffect(() => {
    if (!allAnswered || finishedRef.current) return;
    finishedRef.current = true;
    haptic.success();
    if (params.path) markDone(pathDoneKey(params.path));
    if (params.lesson !== undefined) markDone(lessonKey(Number(params.lesson)));
  }, [allAnswered, markDone, params.lesson, params.path]);

  const choose = (q: number, o: number) => {
    if (!draft || picked[q] !== null) return;
    const ok = o === draft.questions[q].answer;
    if (ok) haptic.success();
    else haptic.error();
    record('reading', ok);
    setPicked((p) => p.map((v, i) => (i === q ? o : v)));
  };

  const listen = () => {
    if (!draft) return;
    void speak(draft.text);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('read.title')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        <Txt variant="title">{draft?.title || wordTopicLabel(topic, lang).replace(/^./, (ch) => ch.toUpperCase())}</Txt>
        <Txt variant="body" color="inkSoft">
          {t('read.intro', { level, topic: wordTopicLabel(topic, lang) })}
        </Txt>

        {connection !== 'ready' && status === 'idle' ? (
          <Paper tone="alt">
            <Txt variant="small" color="inkSoft">
              {t('read.needsModel', { note: notReadyNote(connection, pct, lang) })}
            </Txt>
          </Paper>
        ) : null}

        {status === 'running' ? (
          <Paper tone="alt" style={{ gap: space.s }}>
            <Thinking label={t('read.writing')} />
            {wordsSoFar > 0 ? (
              <Txt variant="caption" color="inkSoft">
                {t('read.words', { count: wordsSoFar })}
              </Txt>
            ) : null}
          </Paper>
        ) : null}

        {status === 'error' ? (
          <Paper tone="red" style={{ gap: space.m }}>
            <Txt variant="small" style={{ color: c.red }}>
              {error}
            </Txt>
            <Button label={t('common.retry')} icon={RefreshCw} kind="secondary" size="medium" onPress={() => void fetchText()} disabled={connection !== 'ready'} />
          </Paper>
        ) : null}

        {draft ? (
          <Animated.View entering={FadeIn.duration(300)} style={{ gap: space.m }}>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button label={speaking ? t('read.stop') : t('read.listen')} icon={speaking ? X : Headphones} kind={shownText ? 'secondary' : 'primary'} size="medium" grow onPress={listen} />
              <Button label={shownText ? t('read.hideText') : t('read.showText')} icon={shownText ? EyeOff : Eye} kind="secondary" size="medium" grow onPress={() => setShownText((v) => !v)} />
            </View>
            {shownText ? (
              <Animated.View entering={FadeInDown.duration(260)}>
                <Paper style={{ gap: space.m }}>
                  <TappableText text={draft.text} />
                  <Txt variant="caption" color="inkFaint">
                    {t('read.tapWord')}
                  </Txt>
                </Paper>
              </Animated.View>
            ) : (
              <Paper tone="alt">
                <Txt variant="small" color="inkSoft">
                  {t('read.hiddenHint')}
                </Txt>
              </Paper>
            )}

            <Txt variant="headline" style={{ marginTop: space.s }}>
              {t('read.questions')}
            </Txt>
            {draft.questions.map((q, qi) => {
              const chosen = picked[qi];
              return (
                <Animated.View key={qi} entering={FadeInDown.delay(qi * 60).duration(300)}>
                  <Paper style={{ gap: space.s }}>
                    <De variant="germanStrong" speakable style={{ fontSize: 17, lineHeight: 24 }}>
                      {q.question}
                    </De>
                    {q.options.map((o, oi) => {
                      const isRight = oi === q.answer;
                      const isChosen = chosen === oi;
                      const settled = chosen !== null;
                      const bg = settled && isRight ? c.greenTint : isChosen && !isRight ? c.redTint : c.sheetAlt;
                      const fg = settled && isRight ? c.green : isChosen && !isRight ? c.red : c.ink;
                      return (
                        <Press key={oi} onPress={() => choose(qi, oi)} disabled={settled} dimWhenDisabled={false} scaleTo={0.99} accessibilityLabel={`${String.fromCharCode(97 + oi)}) ${o}`}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, backgroundColor: bg, borderRadius: radius.control, paddingHorizontal: space.l, paddingVertical: 12 }}>
                            <Txt variant="smallStrong" style={{ color: fg, width: 18 }}>
                              {String.fromCharCode(97 + oi)})
                            </Txt>
                            <Text style={{ flex: 1, fontFamily: font.de, fontSize: 17, lineHeight: 24, color: fg }}>{o}</Text>
                            {settled && isRight ? (
                              <Animated.View entering={ZoomIn.duration(220)}>
                                <Check size={18} color={c.green} strokeWidth={2.6} />
                              </Animated.View>
                            ) : null}
                          </View>
                        </Press>
                      );
                    })}
                  </Paper>
                </Animated.View>
              );
            })}

            {allAnswered ? (
              <Animated.View entering={ZoomIn.duration(360)} style={{ gap: space.m }}>
                <Paper tone={correct === draft.questions.length ? 'green' : 'amber'} style={{ gap: space.xs }}>
                  <Txt variant="bodyStrong" style={{ color: correct === draft.questions.length ? c.green : c.amberInk }}>
                    {t('read.score', { correct, total: draft.questions.length })}
                  </Txt>
                  <Txt variant="small" color="inkSoft">
                    {correct === draft.questions.length ? t('read.scoreAll') : t('read.scoreSome')}
                  </Txt>
                </Paper>
                <CheckFooter checks={draft.checks} noteTitle={tutor.noteTitle} />
                <View style={{ flexDirection: 'row', gap: space.s }}>
                  <Button label={t('read.another')} icon={RefreshCw} kind="secondary" size="medium" grow onPress={() => void fetchText()} disabled={connection !== 'ready'} />
                  <Button label={t('common.done')} size="medium" grow onPress={() => (router.canGoBack() ? router.back() : router.replace('/path' as never))} />
                </View>
              </Animated.View>
            ) : null}
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}
