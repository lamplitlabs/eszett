// The mock oral exam (src/harness/exam.ts): the speaking part of the level's Goethe exam, run as it is held.
// The tutor is the examiner: it writes the task sheet, the voice reads the examiner's lines, the learner
// prepares against a clock and speaks against another, the phone's recognizer writes down what it hears
// (src/features/dictation.ts, continuous), the examiner asks back, and at the end of every part the tutor rates
// the transcript on the exam's grid - task, coherence, vocabulary, structures, 0-4 each - while the app counts
// the pace. Attempts are kept (src/state/exams.ts). Reached from Practice › Exam.

import { router } from 'expo-router';
import { ArrowRight, Check, Clock3, Download, GraduationCap, Mic, Square } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDictation } from '@/features/dictation';
import { notReadyNote, useModelPercent } from '@/features/modelStatus';
import {
  EXAM_CRITERIA,
  examFor,
  examPercent,
  fluencyScore,
  MAX_SCORE,
  partPercent,
  passed,
  wordsOf,
  wordsPerMinute,
  type ExamPart,
  type ExamPartResult,
  type ExamRating,
  type ExamSheet,
  type ExamTurn,
} from '@/harness/exam';
import { useI18n } from '@/i18n';
import { describeError, tutor, useModel } from '@/model/runtime';
import { attemptsNewestFirst, useExams } from '@/state/exams';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Button, Paper, ProgressBar } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { TopBar } from '@/ui/Screen';
import { speak, stopSpeaking } from '@/ui/speech';
import { De, Txt } from '@/ui/Text';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';
import { Thinking } from '@/ui/Thinking';

type Phase = 'overview' | 'sheet' | 'prep' | 'speak' | 'followup' | 'rating' | 'result' | 'summary';

const fmt = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
/** The wall clock, read in handlers and timers (never in render). */
const clock = () => Date.now();

function ScoreRow({ label, score, note }: { label: string; score: number; note?: string }) {
  const { c } = useTheme();
  const tone = score >= 3 ? c.green : score >= 2 ? c.amberInk : c.red;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s }}>
        <Txt variant="small" style={{ flex: 1 }}>
          {label}
        </Txt>
        <Txt variant="smallStrong" style={{ color: tone }}>
          {score}/{MAX_SCORE}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: MAX_SCORE }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < score ? tone : c.rule }} />
        ))}
      </View>
      {note ? (
        <Txt variant="caption" color="inkFaint">
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

export default function ExamScreen() {
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const connection = useModel((s) => s.status);
  const pct = useModelPercent();
  const record = useProgress((s) => s.record);
  const attempts = useExams((s) => s.attempts);
  const addAttempt = useExams((s) => s.add);
  const exam = examFor(level);
  const history = attemptsNewestFirst(attempts, level);

  const [phase, setPhase] = useState<Phase>('overview');
  const [partIndex, setPartIndex] = useState(0);
  const [sheet, setSheet] = useState<ExamSheet | null>(null);
  const [examinerLine, setExaminerLine] = useState('');
  const [turns, setTurns] = useState<ExamTurn[]>([]);
  const [heard, setHeard] = useState('');
  const [rating, setRating] = useState<ExamRating | null>(null);
  const [results, setResults] = useState<ExamPartResult[]>([]);
  const [error, setError] = useState('');
  // clocks: the preparation ends at `prepEnd`, a turn started at `turnStart`; `now` ticks while either runs
  const [prepEnd, setPrepEnd] = useState(0);
  const [turnStart, setTurnStart] = useState(0);
  const [now, setNow] = useState(clock);
  const part: ExamPart = exam.parts[partIndex] ?? exam.parts[0];
  const inPrep = phase === 'prep' && now < prepEnd;
  const speakingPhase = phase === 'speak' || (phase === 'prep' && !inPrep);
  const prepLeft = Math.max(0, Math.ceil((prepEnd - now) / 1000));

  useEffect(() => () => stopSpeaking(), []);

  const say = (line: string) => {
    setExaminerLine(line);
    void speak(line);
  };

  const ratePart = async (allTurns: ExamTurn[], currentSheet: ExamSheet | null) => {
    setPhase('rating');
    setError('');
    try {
      const r = await tutor.examRating(part, currentSheet, allTurns, { level, lang: explainIn });
      const result: ExamPartResult = { partId: part.id, turns: allTurns, rating: r, fluency: fluencyScore(level, part, allTurns), words: allTurns.reduce((n, x) => n + wordsOf(x.said), 0) };
      setRating(r);
      setResults((v) => [...v.filter((x) => x.partId !== part.id), result]);
      const p = partPercent(result);
      if (p !== null) record('speaking', passed(p));
      haptic.success();
      setPhase('result');
    } catch (e) {
      setError(describeError(e));
      setPhase('result');
    }
  };

  const afterTurn = async (said: string, seconds: number) => {
    const turn: ExamTurn = { prompt: examinerLine, said, seconds };
    const allTurns = [...turns, turn];
    setTurns(allTurns);
    setHeard('');
    if (part.followup && allTurns.length === 1) {
      setPhase('followup');
      try {
        const question = await tutor.examFollowup(part, sheet, said, { level, lang: explainIn });
        say(question || t('exam.fallbackQuestion'));
      } catch {
        say(t('exam.fallbackQuestion'));
      }
      setPhase('speak');
      return;
    }
    await ratePart(allTurns, sheet);
  };

  // when the last word arrived: the turn's time runs to there, not to the tap on "I'm done"
  const lastHeardAt = useRef(0);
  const dictation = useDictation({
    continuous: true,
    onInterim: (text) => {
      lastHeardAt.current = clock();
      setHeard(text);
    },
    onFinal: (text) => {
      const end = lastHeardAt.current > turnStart ? lastHeardAt.current : clock();
      const seconds = Math.max(1, Math.round((end - turnStart) / 1000));
      void afterTurn(text, seconds);
    },
  });

  // the clocks tick while preparing or speaking; a turn twice the exam's length is stopped for the candidate
  const listening = dictation.listening;
  const stopTurn = dictation.stop;
  useEffect(() => {
    if (!(phase === 'prep' || phase === 'speak')) return;
    const id = setInterval(() => {
      const t0 = clock();
      setNow(t0);
      if (listening && turnStart && t0 - turnStart > part.speakSeconds * 2000) stopTurn();
    }, 500);
    return () => clearInterval(id);
  }, [listening, part.speakSeconds, phase, stopTurn, turnStart]);

  const loadPart = async (index: number) => {
    const p = exam.parts[index];
    setPartIndex(index);
    setSheet(null);
    setTurns([]);
    setRating(null);
    setHeard('');
    setError('');
    setPhase('sheet');
    try {
      const s = await tutor.examSheet(p, { level, lang: explainIn });
      setSheet(s);
      setExaminerLine(p.examiner_de);
      void speak(p.examiner_de);
      const t0 = clock();
      setPrepEnd(t0 + p.prepSeconds * 1000);
      setNow(t0);
      setPhase(p.prepSeconds > 0 ? 'prep' : 'speak');
    } catch (e) {
      setError(describeError(e));
      setPhase('overview');
    }
  };

  const startTurn = () => {
    stopSpeaking();
    setHeard('');
    const t0 = clock();
    lastHeardAt.current = 0;
    setTurnStart(t0);
    setNow(t0);
    setPhase('speak');
    void dictation.start();
  };

  const nextPart = () => {
    if (partIndex + 1 < exam.parts.length) void loadPart(partIndex + 1);
    else {
      const percent = examPercent(results);
      if (percent !== null) addAttempt({ level, percent, parts: results });
      setPhase('summary');
    }
  };

  const restart = () => {
    setResults([]);
    setPhase('overview');
  };

  const total = examPercent(results);
  const speakElapsed = dictation.listening ? Math.max(0, Math.round((now - turnStart) / 1000)) : 0;
  const reasonText =
    dictation.reason === 'offline-pack'
      ? t('speak.offlinePack')
      : dictation.reason === 'permission'
        ? t('speak.permission')
        : dictation.reason
          ? t('speak.unavailable')
          : null;

  const sheetCard = (
    <Paper tone="amber" style={{ gap: space.s }}>
      <Txt variant="smallStrong" style={{ color: c.amberInk }}>
        {t('exam.sheet')}
      </Txt>
      {sheet ? (
        <>
          <De variant="germanStrong">{sheet.heading}</De>
          {sheet.points.map((p, i) => (
            <Text key={i} style={{ fontFamily: font.de, fontSize: 17, lineHeight: 25, color: c.ink }}>
              {`•  ${p}`}
            </Text>
          ))}
        </>
      ) : (
        <Txt variant="small" color="inkSoft">
          {t(`exam.part.${part.id}`)}
        </Txt>
      )}
    </Paper>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('exam.title')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        {phase === 'overview' ? (
          <Animated.View entering={FadeIn.duration(260)} style={{ gap: space.m }}>
            <Txt variant="title">{exam.name}</Txt>
            <Txt variant="body" color="inkSoft">
              {t('exam.intro', { count: exam.parts.length, minutes: exam.minutes })}
            </Txt>
            {exam.parts.map((p, i) => (
              <Paper key={p.id} style={{ gap: space.xs }}>
                <De variant="germanStrong" style={{ fontSize: 17, lineHeight: 24 }}>
                  {p.title_de}
                </De>
                <Txt variant="small" color="inkSoft">
                  {t(`exam.part.${p.id}`)}
                </Txt>
                <Txt variant="caption" color="inkFaint">
                  {[p.prepSeconds ? t('exam.prepTime', { seconds: p.prepSeconds }) : null, t('exam.speakTime', { seconds: p.speakSeconds })].filter(Boolean).join(' · ')}
                  {i === exam.parts.length - 1 ? '' : ''}
                </Txt>
              </Paper>
            ))}
            <Paper tone="alt" style={{ gap: space.xs }}>
              <Txt variant="small" color="inkSoft">
                {t('exam.criteriaNote')}
              </Txt>
            </Paper>
            {history.length ? (
              <Paper tone="alt" style={{ gap: space.xs }}>
                <Txt variant="smallStrong">{t('exam.history')}</Txt>
                {history.slice(0, 5).map((a) => (
                  <View key={a.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Txt variant="small" color="inkSoft">
                      {new Date(a.created).toLocaleDateString()}
                    </Txt>
                    <Txt variant="smallStrong" style={{ color: passed(a.percent) ? c.green : c.amberInk }}>
                      {t('exam.total', { percent: a.percent })}
                    </Txt>
                  </View>
                ))}
              </Paper>
            ) : null}
            {connection !== 'ready' ? (
              <Paper tone="alt">
                <Txt variant="small" color="inkSoft">
                  {t('read.needsModel', { note: notReadyNote(connection, pct, explainIn) })}
                </Txt>
              </Paper>
            ) : null}
            {!dictation.available ? (
              <Paper tone="alt" style={{ gap: space.m }}>
                <Txt variant="small" color="inkSoft">
                  {t('exam.noRecognizer')} {reasonText}
                </Txt>
                {dictation.downloadOfflinePack ? <Button label={t('speak.downloadPack')} icon={Download} kind="secondary" size="medium" onPress={() => void dictation.downloadOfflinePack?.()} /> : null}
              </Paper>
            ) : null}
            {error ? (
              <Txt variant="small" style={{ color: c.red }}>
                {error}
              </Txt>
            ) : null}
            <Button label={t('exam.start')} icon={GraduationCap} onPress={() => void loadPart(0)} disabled={connection !== 'ready' || !dictation.available} />
          </Animated.View>
        ) : null}

        {phase !== 'overview' && phase !== 'summary' ? (
          <Animated.View key={part.id} entering={FadeIn.duration(260)} style={{ gap: space.m }}>
            <ProgressBar value={(partIndex + (phase === 'result' ? 1 : 0.4)) / exam.parts.length} />
            <Txt variant="caption" color="inkSoft">
              {t('grammar.counter', { n: partIndex + 1, total: exam.parts.length })} · {exam.name}
            </Txt>
            <De variant="germanStrong" style={{ fontSize: 20, lineHeight: 28 }}>
              {part.title_de}
            </De>

            {phase === 'sheet' ? (
              <Paper tone="alt">
                <Thinking label={t('exam.writingSheet')} />
              </Paper>
            ) : (
              <>
                {sheetCard}
                <Paper style={{ gap: space.xs }}>
                  <Txt variant="caption" color="inkSoft">
                    {t('exam.examiner')}
                  </Txt>
                  <De variant="german" speakable>
                    {examinerLine}
                  </De>
                </Paper>
              </>
            )}

            {inPrep ? (
              <Paper tone="royal" style={{ gap: space.s }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                  <Clock3 size={18} color={c.royal} />
                  <Txt variant="bodyStrong" style={{ color: c.royal }}>
                    {t('exam.prep')} · {fmt(prepLeft)}
                  </Txt>
                </View>
                <Txt variant="small" color="inkSoft">
                  {t('exam.prepHint')}
                </Txt>
                <Button label={t('exam.skipPrep')} icon={Mic} kind="secondary" size="medium" onPress={startTurn} />
              </Paper>
            ) : null}

            {speakingPhase && !inPrep ? (
              <View style={{ gap: space.m }}>
                <Txt variant="small" color="inkSoft">
                  {turns.length ? t('exam.answerFollowup') : t('exam.speakTarget', { seconds: part.speakSeconds })}
                </Txt>
                {dictation.listening ? (
                  <Paper tone="red" style={{ gap: space.s }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Txt variant="caption" style={{ color: c.red }}>
                        {t('speak.listening')}
                      </Txt>
                      <Txt variant="smallStrong" style={{ color: speakElapsed > part.speakSeconds ? c.amberInk : c.ink }}>
                        {fmt(speakElapsed)} / {fmt(part.speakSeconds)}
                      </Txt>
                    </View>
                    {heard ? <Text style={{ fontFamily: font.de, fontSize: 17, lineHeight: 25, color: c.ink }}>{heard}</Text> : null}
                    <Button label={t('exam.stop')} icon={Square} kind="pen" size="medium" onPress={dictation.stop} />
                  </Paper>
                ) : (
                  <Button label={turns.length ? t('exam.answer') : t('exam.speak')} icon={Mic} onPress={startTurn} />
                )}
                {dictation.error && dictation.error !== 'not-allowed' && !dictation.listening ? (
                  <Txt variant="small" style={{ color: c.red }}>
                    {dictation.error === 'no-speech' || dictation.error === 'speech-timeout' ? t('speak.nothingHeard') : t('speak.recognizerError')}
                  </Txt>
                ) : null}
              </View>
            ) : null}

            {phase === 'followup' ? (
              <Paper tone="alt">
                <Thinking label={t('exam.thinkingFollowup')} />
              </Paper>
            ) : null}
            {phase === 'rating' ? (
              <Paper tone="alt">
                <Thinking label={t('exam.ratingNow')} />
              </Paper>
            ) : null}

            {turns.length && phase !== 'result' ? (
              <Paper tone="alt" style={{ gap: space.xs }}>
                <Txt variant="caption" color="inkSoft">
                  {t('exam.said')}
                </Txt>
                {turns.map((x, i) => (
                  <Text key={i} style={{ fontFamily: font.de, fontSize: 15, lineHeight: 22, color: c.inkSoft }}>
                    {x.said || '…'}
                  </Text>
                ))}
              </Paper>
            ) : null}

            {phase === 'result' ? (
              <Animated.View entering={FadeInDown.duration(300)} style={{ gap: space.m }}>
                {rating ? (
                  <>
                    <Paper style={{ gap: space.m }}>
                      {EXAM_CRITERIA.map((k) => (
                        <ScoreRow key={k} label={t(`exam.criterion.${k}`)} score={rating.scores[k]} />
                      ))}
                      <ScoreRow label={t('exam.criterion.fluency', { wpm: wordsPerMinute(turns) })} score={fluencyScore(level, part, turns)} note={t('exam.fluencyNote')} />
                      {(() => {
                        const r = results.find((x) => x.partId === part.id);
                        const p = r ? partPercent(r) : null;
                        return p !== null ? (
                          <Txt variant="headline" style={{ color: passed(p) ? c.green : c.amberInk }}>
                            {t('exam.total', { percent: p })}
                          </Txt>
                        ) : null;
                      })()}
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
                  <Paper tone="red" style={{ gap: space.m }}>
                    <Txt variant="small" style={{ color: c.red }}>
                      {error}
                    </Txt>
                    <Button label={t('common.retry')} kind="secondary" size="medium" onPress={() => void ratePart(turns, sheet)} />
                  </Paper>
                )}
                <Paper tone="alt" style={{ gap: space.xs }}>
                  <Txt variant="caption" color="inkSoft">
                    {t('exam.said')}
                  </Txt>
                  {turns.map((x, i) => (
                    <Text key={i} style={{ fontFamily: font.de, fontSize: 15, lineHeight: 22, color: c.inkSoft }}>
                      {x.said || '…'}
                    </Text>
                  ))}
                </Paper>
                <Button label={partIndex + 1 < exam.parts.length ? t('exam.next') : t('exam.finish')} icon={ArrowRight} onPress={nextPart} />
              </Animated.View>
            ) : null}
          </Animated.View>
        ) : null}

        {phase === 'summary' ? (
          <Animated.View entering={ZoomIn.duration(360)} style={{ gap: space.m }}>
            <Txt variant="title">{t('exam.summary')}</Txt>
            {total !== null ? (
              <Paper tone={passed(total) ? 'green' : 'amber'} style={{ gap: space.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                  {passed(total) ? <Check size={20} color={c.green} strokeWidth={2.6} /> : null}
                  <Txt variant="headline" style={{ color: passed(total) ? c.green : c.amberInk }}>
                    {t('exam.total', { percent: total })}
                  </Txt>
                </View>
                <Txt variant="small" color="inkSoft">
                  {passed(total) ? t('exam.pass') : t('exam.fail')}
                </Txt>
              </Paper>
            ) : null}
            {exam.parts.map((p) => {
              const r = results.find((x) => x.partId === p.id);
              const pp = r ? partPercent(r) : null;
              return (
                <Paper key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <De variant="germanStrong" style={{ fontSize: 16, lineHeight: 22 }}>
                      {p.title_de}
                    </De>
                    {r ? (
                      <Txt variant="caption" color="inkSoft">
                        {t('exam.partFacts', { words: r.words, wpm: wordsPerMinute(r.turns) })}
                      </Txt>
                    ) : null}
                  </View>
                  <View style={{ backgroundColor: pp !== null && passed(pp) ? c.greenTint : c.amberTint, borderRadius: radius.small, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Txt variant="smallStrong" style={{ color: pp !== null && passed(pp) ? c.green : c.amberInk }}>
                      {pp !== null ? `${pp}` : '–'}
                    </Txt>
                  </View>
                </Paper>
              );
            })}
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button label={t('exam.tryAgain')} kind="secondary" size="medium" grow onPress={restart} />
              <Button label={t('common.done')} size="medium" grow onPress={() => (router.canGoBack() ? router.back() : router.replace('/practice' as never))} />
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}
