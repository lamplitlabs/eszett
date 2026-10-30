// Eine Minute - one minute of free speech on today's prompt (src/harness/minute.ts). The phone's recognizer
// writes along (continuous dictation), the clock stops the turn at sixty seconds, the app counts words, pace,
// variety and fillers, and the tutor rates the talk on the exam grid with a comment, a tip and one improved
// sentence. Every talk is kept (src/state/speaking.ts) so the Me tab can show the pace climbing.

import { router, useLocalSearchParams } from 'expo-router';
import { Check, Mic, RotateCcw, Shuffle, Square } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDictation } from '@/features/dictation';
import { EXAM_CRITERIA, fluencyScore, type ExamRating } from '@/harness/exam';
import { LEVELS, type Level } from '@/harness/levels';
import { MIN_WORDS, MINUTE_SECONDS, minutePart, minutePromptsFor, minuteResult, minuteSheet, minuteStats, promptOfDay, type MinutePrompt } from '@/harness/minute';
import { useI18n } from '@/i18n';
import { describeError, isReady, tutor } from '@/model/runtime';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { newestFirst, useSpeaking } from '@/state/speaking';
import { dayKey } from '@/state/storage';
import { Button, Paper, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { ScoreRow } from '@/ui/ScoreRow';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { font, gutter, space, useTheme } from '@/ui/theme';
import { Confetti } from '@/ui/motion/Confetti';
import { CountUp, ProgressRing } from '@/ui/motion/Numbers';

type Phase = 'ready' | 'speak' | 'rating' | 'result';
const clock = () => Date.now();

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Txt variant="title" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Txt>
      <Txt variant="caption" color="inkSoft" center>
        {label}
      </Txt>
    </View>
  );
}

export default function MinuteScreen() {
  const params = useLocalSearchParams<{ level?: Level; prompt?: string }>();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const learnerLevel = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const level: Level = params.level && LEVELS.includes(params.level) ? params.level : learnerLevel;
  const talks = useSpeaking((s) => s.talks);
  const addTalk = useSpeaking((s) => s.addTalk);
  const record = useProgress((s) => s.record);

  // today's prompt first; "another" walks on through the level's prompts
  const doneIds = newestFirst(talks)
    .filter((x) => x.level === level)
    .map((x) => x.prompt);
  const [prompt, setPrompt] = useState<MinutePrompt>(() => minutePromptsFor(level).find((p) => p.id === params.prompt) ?? promptOfDay(level, doneIds));
  const [phase, setPhase] = useState<Phase>('ready');
  const [heard, setHeard] = useState('');
  const [said, setSaid] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [rating, setRating] = useState<ExamRating | null>(null);
  const [ratingError, setRatingError] = useState('');
  const [percent, setPercent] = useState<number | null>(null);
  const [turnStart, setTurnStart] = useState(0);
  const [now, setNow] = useState(0);
  const lastHeardAt = useRef(0);
  const finishedRef = useRef(false);

  const finish = async (text: string, secs: number) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const spoken = text.trim();
    setSaid(spoken);
    setSeconds(secs);
    setHeard('');
    if (!spoken) {
      setPhase('ready');
      return;
    }
    haptic.success();
    setPhase('rating');
    let r: ExamRating | null = null;
    setRatingError('');
    if (isReady()) {
      try {
        r = await tutor.examRating(minutePart(level), minuteSheet(prompt), [{ prompt: prompt.prompt_de, said: spoken, seconds: secs }], { level, lang: explainIn });
      } catch (e) {
        setRatingError(describeError(e));
      }
    } else setRatingError(t('minute.noTutor'));
    const result = minuteResult(level, spoken, secs, r);
    const stats = minuteStats(spoken, secs);
    setRating(r);
    setPercent(result.percent);
    addTalk({ level, prompt: prompt.id, words: stats.words, distinct: stats.distinct, seconds: secs, wpm: stats.wpm, fillers: stats.fillers, rating: r, fluency: result.fluency, percent: result.percent });
    record('speaking', null);
    setPhase('result');
  };

  // the text of finished recognizer sessions: a pause for thought ends a session, and the next one is started
  // while time remains, so one minute of talk may be several sessions joined
  const accRef = useRef('');
  const heardRef = useRef('');
  const stopAskedAt = useRef(0);
  const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(' ');
  const dictation = useDictation({
    continuous: true,
    onInterim: (text) => {
      lastHeardAt.current = clock();
      heardRef.current = join(accRef.current, text);
      setHeard(heardRef.current);
    },
    onFinal: (text) => {
      const all = join(accRef.current, text);
      const t0 = clock();
      if (!stopAskedAt.current && !finishedRef.current && t0 - turnStart < (MINUTE_SECONDS - 3) * 1000) {
        accRef.current = all;
        heardRef.current = all;
        setHeard(all);
        void dictation.start();
        return;
      }
      const end = lastHeardAt.current > turnStart ? lastHeardAt.current : t0;
      const secs = Math.min(MINUTE_SECONDS, Math.max(1, Math.round((end - turnStart) / 1000)));
      void finish(all || heardRef.current, secs);
    },
  });

  // the time the talk counts: to the last word heard, never more than the minute
  const secondsSpoken = (t0: number) => {
    const end = lastHeardAt.current > turnStart ? lastHeardAt.current : t0;
    return Math.min(MINUTE_SECONDS, Math.max(1, Math.round((end - turnStart) / 1000)));
  };
  // the timers below call the newest finish, not the one of the render that set them up
  const finishRef = useRef<(text: string, secs: number) => Promise<void>>(finish);
  const secondsRef = useRef(secondsSpoken);
  useEffect(() => {
    finishRef.current = finish;
    secondsRef.current = secondsSpoken;
  });

  // The clock ticks while speaking. At sixty seconds the turn is stopped for the learner; a recognizer that does
  // not answer the stop within a moment is cut off and the words heard so far count. Sessions are only ever
  // restarted from a clean end (onFinal above): an abort leaves a late `end` behind that would be mistaken for
  // the new session's.
  const stop = dictation.stop;
  const abort = dictation.abort;
  useEffect(() => {
    if (phase !== 'speak') return;
    const id = setInterval(() => {
      const t0 = clock();
      setNow(t0);
      if (!turnStart || finishedRef.current) return;
      if (stopAskedAt.current) {
        if (t0 - stopAskedAt.current > 2500) {
          abort();
          void finishRef.current(heardRef.current, secondsRef.current(t0));
        }
      } else if (t0 - turnStart >= MINUTE_SECONDS * 1000) {
        stopAskedAt.current = t0;
        stop();
      }
    }, 250);
    return () => clearInterval(id);
  }, [abort, phase, stop, turnStart]);

  // The recognizer complained. Silence at the start (no speech, a timeout) is a pause for thought: the error is
  // cleared and the end that follows starts the next session. Anything else ends the turn: the words heard
  // count, or without any the screen goes back to the start with the note.
  const error = dictation.error;
  const reset = dictation.reset;
  useEffect(() => {
    if (phase !== 'speak' || !turnStart || !error || finishedRef.current) return;
    const benign = error === 'no-speech' || error === 'speech-timeout';
    if (benign && !stopAskedAt.current && clock() - turnStart < (MINUTE_SECONDS - 3) * 1000) {
      reset();
      return;
    }
    abort();
    if (heardRef.current.trim()) void finishRef.current(heardRef.current, secondsRef.current(clock()));
    else {
      finishedRef.current = true;
      setPhase('ready');
    }
  }, [abort, error, phase, reset, turnStart]);

  const start = () => {
    haptic.tap();
    finishedRef.current = false;
    dictation.reset();
    heardRef.current = '';
    accRef.current = '';
    stopAskedAt.current = 0;
    setHeard('');
    setSaid('');
    setRating(null);
    setPercent(null);
    const t0 = clock();
    lastHeardAt.current = 0;
    setTurnStart(t0);
    setNow(t0);
    setPhase('speak');
    void dictation.start();
  };

  const another = () => {
    const pool = minutePromptsFor(level);
    const i = pool.findIndex((p) => p.id === prompt.id);
    setPrompt(pool[(i + 1) % pool.length]);
    setPhase('ready');
    setSaid('');
    setRating(null);
    setPercent(null);
  };

  const elapsed = phase === 'speak' ? Math.min(MINUTE_SECONDS, Math.max(0, Math.round((now - turnStart) / 1000))) : 0;
  const left = MINUTE_SECONDS - elapsed;
  const stats = said ? minuteStats(said, seconds) : null;
  const today = dayKey();
  const todayDone = newestFirst(talks).filter((x) => dayKey(x.created) === today).length;
  const recent = newestFirst(talks).slice(0, 5);
  const reasonText =
    dictation.reason === 'offline-pack'
      ? t('speak.offlinePack')
      : dictation.reason === 'permission'
        ? t('speak.permission')
        : dictation.reason
          ? t('speak.unavailable')
          : null;

  const promptCard = (
    <Paper tone="amber" style={{ gap: space.m }}>
      <Txt variant="smallStrong" style={{ color: c.amberInk }}>
        {t('minute.todaysPrompt', { level: prompt.level })}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s }}>
        <De variant="germanLarge" style={{ flex: 1 }}>
          {prompt.prompt_de}
        </De>
        <SpeakButton text={prompt.prompt_de} tone="plain" />
      </View>
      {lang !== 'de' ? (
        <Txt variant="small" color="inkSoft">
          {t(`minute.prompt.${prompt.id}`)}
        </Txt>
      ) : null}
      <View style={{ gap: 4 }}>
        {prompt.points_de.map((p) => (
          <Text key={p} style={{ fontFamily: font.de, fontSize: 16, lineHeight: 24, color: c.ink }}>
            {`•  ${p}`}
          </Text>
        ))}
      </View>
    </Paper>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('minute.title')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.l }}>
        {phase === 'ready' ? (
          <Animated.View entering={FadeInDown.duration(220)} style={{ gap: space.l }}>
            <Txt variant="body" color="inkSoft">
              {t('minute.intro', { words: MIN_WORDS[level] })}
            </Txt>
            {promptCard}
            {reasonText ? (
              <Paper tone="alt">
                <Txt variant="small" color="inkSoft">
                  {reasonText}
                </Txt>
              </Paper>
            ) : null}
            {dictation.error && dictation.error !== 'not-allowed' ? (
              <Txt variant="small" style={{ color: c.red }}>
                {dictation.error === 'no-speech' || dictation.error === 'speech-timeout' ? t('speak.nothingHeard') : t('speak.recognizerError')}
              </Txt>
            ) : null}
            <Button label={t('minute.start')} icon={Mic} onPress={start} disabled={!dictation.available} />
            <Button label={t('minute.another')} icon={Shuffle} kind="quiet" size="medium" onPress={another} />
            {recent.length ? (
              <Paper tone="alt" style={{ gap: space.s }}>
                <Txt variant="smallStrong" color="inkSoft">
                  {t('minute.recent', { count: todayDone })}
                </Txt>
                {recent.map((x) => (
                  <View key={x.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s }}>
                    <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>
                      {minutePromptsFor(x.level).find((p) => p.id === x.prompt)?.prompt_de ?? x.prompt}
                    </Txt>
                    <Txt variant="small" color="inkSoft" style={{ fontVariant: ['tabular-nums'] }}>
                      {t('minute.wpmShort', { wpm: x.wpm })}
                      {x.percent !== null ? ` · ${x.percent}` : ''}
                    </Txt>
                  </View>
                ))}
              </Paper>
            ) : null}
          </Animated.View>
        ) : null}

        {phase === 'speak' ? (
          <View style={{ gap: space.l }}>
            {promptCard}
            <Paper tone="red" style={{ gap: space.m, alignItems: 'center' }}>
              <Txt variant="caption" style={{ color: c.red }}>
                {dictation.listening ? t('speak.listening') : t('minute.starting')}
              </Txt>
              <Txt variant="title" style={{ fontSize: 56, lineHeight: 62, color: left <= 10 ? c.red : c.ink, fontVariant: ['tabular-nums'] }}>
                {left}
              </Txt>
              <View style={{ width: '100%', height: 6, borderRadius: 3, backgroundColor: c.rule }}>
                <View style={{ width: `${Math.round((elapsed / MINUTE_SECONDS) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: c.red }} />
              </View>
              {heard ? (
                <Text style={{ fontFamily: font.de, fontSize: 17, lineHeight: 25, color: c.ink, alignSelf: 'stretch' }}>{heard}</Text>
              ) : (
                <Txt variant="small" color="inkSoft">
                  {t('minute.keepGoing')}
                </Txt>
              )}
              <Button
                label={t('minute.stopEarly')}
                icon={Square}
                kind="pen"
                size="medium"
                onPress={() => {
                  stopAskedAt.current = clock();
                  dictation.stop();
                }}
              />
            </Paper>
          </View>
        ) : null}

        {phase === 'rating' ? (
          <View style={{ gap: space.l }}>
            {promptCard}
            <Paper tone="alt">
              <Thinking label={t('minute.ratingNow')} />
            </Paper>
          </View>
        ) : null}

        {phase === 'result' && stats ? (
          <Animated.View entering={FadeInDown.duration(300)} style={{ gap: space.l }}>
            <Confetti shot={stats.words >= MIN_WORDS[level] ? `minute-${stats.words}-${seconds}` : false} count={56} />
            <Animated.View entering={ZoomIn.duration(400)} style={{ alignItems: 'center', gap: space.xs }}>
              <ProgressRing value={Math.min(1, stats.words / Math.max(1, MIN_WORDS[level] * 1.5))} size={124} stroke={8} color={percent === null ? 'inkFaint' : percent >= 60 ? 'green' : 'amber'}>
                <CountUp value={stats.wpm} style={{ fontSize: 36, lineHeight: 42 }} />
                <Txt variant="caption" color="inkSoft">
                  {t('minute.wpmLabel')}
                </Txt>
              </ProgressRing>
              <De variant="display">{stats.words >= MIN_WORDS[level] ? 'Gut gesprochen!' : 'Weiter so!'}</De>
            </Animated.View>
            <Paper style={{ flexDirection: 'row', gap: space.s }}>
              <Stat value={String(stats.words)} label={t('minute.words')} />
              <Stat value={String(stats.distinct)} label={t('minute.distinct')} />
              <Stat value={String(stats.fillers)} label={t('minute.fillers')} />
              <Stat value={`${seconds}s`} label={t('minute.seconds')} />
            </Paper>
            <Paper tone="alt" style={{ gap: space.xs }}>
              <Txt variant="caption" color="inkSoft">
                {t('exam.said')}
              </Txt>
              <Text style={{ fontFamily: font.de, fontSize: 16, lineHeight: 24, color: c.ink }}>{said}</Text>
            </Paper>
            {rating ? (
              <>
                <Paper style={{ gap: space.m }}>
                  {EXAM_CRITERIA.map((k) => (
                    <ScoreRow key={k} label={t(`exam.criterion.${k}`)} score={rating.scores[k]} />
                  ))}
                  <ScoreRow label={t('exam.criterion.fluency', { wpm: stats.wpm })} score={fluencyScore(level, minutePart(level), [{ prompt: '', said, seconds }])} note={t('exam.fluencyNote')} />
                  {percent !== null ? (
                    <Txt variant="headline" style={{ color: percent >= 60 ? c.green : c.amberInk }}>
                      {t('exam.total', { percent })}
                    </Txt>
                  ) : null}
                </Paper>
                {rating.comment ? (
                  <Paper tone="alt" style={{ gap: space.xs }}>
                    <Txt variant="smallStrong">{t('exam.comment')}</Txt>
                    <Txt variant="small">{rating.comment}</Txt>
                  </Paper>
                ) : null}
                {rating.tip ? (
                  <Paper tone="amber" style={{ gap: space.xs }}>
                    <Txt variant="smallStrong" style={{ color: c.amberInk }}>
                      {t('exam.tip')}
                    </Txt>
                    <Txt variant="small">{rating.tip}</Txt>
                  </Paper>
                ) : null}
                {rating.better ? (
                  <Paper tone="green" style={{ gap: space.xs }}>
                    <Txt variant="smallStrong" style={{ color: c.green }}>
                      {t('exam.better')}
                    </Txt>
                    <De variant="german" speakable>
                      {rating.better}
                    </De>
                  </Paper>
                ) : null}
              </>
            ) : (
              <Paper tone="alt" style={{ gap: space.xs }}>
                <Txt variant="small" color="inkSoft">
                  {t('minute.unrated')}
                </Txt>
                {ratingError ? (
                  <Txt variant="caption" color="inkFaint">
                    {ratingError}
                  </Txt>
                ) : null}
              </Paper>
            )}
            <View style={{ gap: space.s }}>
              <Button label={t('minute.again')} icon={RotateCcw} kind="secondary" onPress={start} />
              <Button label={t('minute.another')} icon={Shuffle} kind="secondary" onPress={another} />
              <Button label={t('common.done')} icon={Check} onPress={() => router.back()} />
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}
