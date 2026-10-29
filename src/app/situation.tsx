// Listening situations (src/harness/situations.ts): a platform announcement, a voicemail, a radio piece, a
// dialogue at a counter - written by the tutor for the level, played through the phone's voice with the sound
// of the place (a chime and the concourse for an announcement, a beep and the line for a voicemail), the text
// hidden until the three questions are answered, as the exams do it. The piece is kept with the readings, so
// it opens again at once; "another" asks the tutor for a new one. Reached from Practice › Listening
// (`/situation?key=<situation>`) and from the course's listening steps.

import { router, useLocalSearchParams } from 'expo-router';
import { Check, Eye, EyeOff, Headphones, RefreshCw, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { speakInNoise, stopNoise, type NoiseLevel } from '@/features/ambience';
import { notReadyNote, useModelPercent } from '@/features/modelStatus';
import type { ReadingDraft } from '@/harness/reading';
import { situationByKey, situationsFor } from '@/harness/situations';
import type { AnswerChecks } from '@/harness/verify';
import { useI18n } from '@/i18n';
import { describeError, tutor, useModel } from '@/model/runtime';
import { useAuthored } from '@/state/authored';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { CheckFooter } from '@/ui/CheckFooter';
import { Button, Paper, Pill, Press } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { TopBar } from '@/ui/Screen';
import { onSpeaking } from '@/ui/speech';
import { De, Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

type Draft = ReadingDraft & { checks: AnswerChecks };

export default function SituationScreen() {
  const params = useLocalSearchParams<{ key?: string }>();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const connection = useModel((s) => s.status);
  const pct = useModelPercent();
  const record = useProgress((s) => s.record);
  const options = situationsFor(level);
  const requested = typeof params.key === 'string' ? params.key : '';
  const situationKey: string = options.some((s) => s.key === requested) || situationByKey(requested) ? requested : options[0].key;
  const situation = situationByKey(situationKey) ?? options[0];
  const readingKey = `situation:${level}:${situationKey}`;
  const saved = useAuthored((s) => s.readings[readingKey]);
  const addReading = useAuthored((s) => s.addReading);

  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>(() => (saved ? 'done' : 'idle'));
  const [draft, setDraft] = useState<Draft | null>(() => saved ?? null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<(number | null)[]>(() => (saved ? saved.questions.map(() => null) : []));
  const [shownText, setShownText] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [plays, setPlays] = useState(0);
  const [noise, setNoise] = useState<NoiseLevel>('medium');
  // which key has had its automatic start / its finish haptic, so each piece gets them once (refs, touched in effects only)
  const startedFor = useRef<string | null>(saved ? readingKey : null);
  const finishedFor = useRef<string | null>(null);
  const shownKey = useRef(readingKey);

  useEffect(() => onSpeaking((now) => setSpeaking(now !== null)), []);
  useEffect(() => () => stopNoise(), []);

  const fetchText = async () => {
    stopNoise();
    setStatus('running');
    setDraft(null);
    setShownText(false);
    setPicked([]);
    setPlays(0);
    finishedFor.current = null;
    try {
      const picked = situationByKey(situationKey);
      if (!picked) return;
      const r = await tutor.situationText(picked, { level, lang: explainIn });
      setDraft(r);
      setPicked(r.questions.map(() => null));
      setStatus('done');
      addReading(readingKey, { title: r.title, text: r.text, questions: r.questions, checks: r.checks, level, topic: situationKey, generated: true, created: Date.now() });
    } catch (e) {
      setError(describeError(e));
      setStatus('error');
    }
  };

  // another situation chosen: its kept piece shows, or the tutor is asked; the first piece starts by itself once
  // the tutor is reachable. One effect, so the switch and the start cannot race.
  const ready = connection === 'ready';
  useEffect(() => {
    const switched = shownKey.current !== readingKey;
    if (switched) {
      shownKey.current = readingKey;
      stopNoise();
      const kept = useAuthored.getState().readings[readingKey];
      finishedFor.current = null;
      // state follows the key in the next tick, outside this render
      const apply = () => {
        setDraft(kept ?? null);
        setStatus(kept ? 'done' : 'idle');
        setPicked(kept ? kept.questions.map(() => null) : []);
        setShownText(false);
        setPlays(0);
      };
      const id = setTimeout(apply, 0);
      if (kept) {
        startedFor.current = readingKey;
        return () => clearTimeout(id);
      }
      if (!ready) return () => clearTimeout(id);
      startedFor.current = readingKey;
      const start = setTimeout(() => void fetchText(), 0);
      return () => {
        clearTimeout(id);
        clearTimeout(start);
      };
    }
    if (!ready || startedFor.current === readingKey) return;
    startedFor.current = readingKey;
    const start = setTimeout(() => void fetchText(), 0);
    return () => clearTimeout(start);
    // fetchText reads the current situation; it is re-created each render, and a start is automatic once per key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, readingKey]);

  const answered = picked.filter((p) => p !== null).length;
  const correct = draft ? picked.filter((p, i) => p === draft.questions[i].answer).length : 0;
  const allAnswered = draft !== null && answered === draft.questions.length;
  useEffect(() => {
    if (!allAnswered || finishedFor.current === readingKey) return;
    finishedFor.current = readingKey;
    haptic.success();
  }, [allAnswered, readingKey]);

  const choose = (q: number, o: number) => {
    if (!draft || picked[q] !== null) return;
    const ok = o === draft.questions[q].answer;
    if (ok) haptic.success();
    else haptic.error();
    record('listening', ok);
    setPicked((p) => p.map((v, i) => (i === q ? o : v)));
  };

  // the dialogue's speaker labels are read as pauses, not as words
  const spoken = (text: string) => text.replace(/^[^\n:]{1,24}:\s*/gm, '').replace(/\n+/g, '. ');
  const listen = () => {
    if (!draft) return;
    if (speaking) {
      stopNoise();
      return;
    }
    setPlays((n) => n + 1);
    const cue = situation.kind === 'announcement' ? 'chime' : situation.kind === 'voicemail' ? 'beep' : undefined;
    void speakInNoise(spoken(draft.text), situation.place, noise, { rate: 1.0, cue });
  };

  const title = lang === 'de' ? situation.title_de : situation.title_en;

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('situation.title')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        <Txt variant="title">{title}</Txt>
        <Txt variant="body" color="inkSoft">
          {t('situation.intro', { level })}
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {options.map((s) => (
            <Pill key={s.key} label={lang === 'de' ? s.title_de : s.title_en} selected={s.key === situation.key} onPress={() => router.setParams({ key: s.key })} />
          ))}
        </View>

        {connection !== 'ready' && status === 'idle' ? (
          <Paper tone="alt">
            <Txt variant="small" color="inkSoft">
              {t('read.needsModel', { note: notReadyNote(connection, pct, lang) })}
            </Txt>
          </Paper>
        ) : null}
        {status === 'running' ? (
          <Paper tone="alt">
            <Thinking label={t('situation.writing')} />
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
              <Button label={speaking ? t('read.stop') : t('situation.play')} icon={speaking ? X : Headphones} size="medium" grow onPress={listen} />
              <Button label={shownText ? t('read.hideText') : t('read.showText')} icon={shownText ? EyeOff : Eye} kind="secondary" size="medium" grow onPress={() => setShownText((v) => !v)} disabled={!allAnswered} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs }}>
              {(['quiet', 'medium', 'loud'] as NoiseLevel[]).map((n) => (
                <Pill key={n} label={t(`read.noise.${n}`)} selected={noise === n} onPress={() => setNoise(n)} />
              ))}
              <Txt variant="caption" color="inkSoft" style={{ marginLeft: 'auto' }}>
                {t('situation.played', { count: plays })}
              </Txt>
            </View>
            {shownText ? (
              <Animated.View entering={FadeInDown.duration(260)}>
                <Paper style={{ gap: space.m }}>
                  <De variant="german">{draft.text}</De>
                </Paper>
              </Animated.View>
            ) : (
              <Paper tone="alt">
                <Txt variant="small" color="inkSoft">
                  {t('situation.hiddenHint')}
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
                    <De variant="germanStrong" style={{ fontSize: 17, lineHeight: 24 }}>
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
              <Animated.View entering={ZoomIn.duration(380)} style={{ gap: space.m }}>
                <Paper tone={correct === draft.questions.length ? 'green' : 'amber'} style={{ gap: space.xs }}>
                  <Txt variant="headline" style={{ color: correct === draft.questions.length ? c.green : c.amberInk }}>
                    {t('read.score', { correct, total: draft.questions.length })}
                  </Txt>
                  <Txt variant="small" color="inkSoft">
                    {correct === draft.questions.length ? t('situation.scoreAll') : t('situation.scoreSome')}
                  </Txt>
                </Paper>
                <View style={{ flexDirection: 'row', gap: space.s }}>
                  <Button label={t('situation.another')} icon={RefreshCw} kind="secondary" size="medium" grow onPress={() => void fetchText()} disabled={connection !== 'ready'} />
                  <Button label={t('common.done')} size="medium" grow onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/practice' as never))} />
                </View>
                <CheckFooter checks={draft.checks} noteTitle={tutor.noteTitle} />
              </Animated.View>
            ) : null}
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}
