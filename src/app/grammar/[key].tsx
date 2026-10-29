import { router, useLocalSearchParams } from 'expo-router';
import { BadgeCheck, Check, MessageCircle, RefreshCw, Sparkles, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lessonKey } from '@/features/lesson';
import { notReadyNote, useModelPercent } from '@/features/modelStatus';
import { compact } from '@/harness/engines';
import { ruleSegments, type RuleSegment } from '@/harness/paradigm';
import { pathDoneKey } from '@/harness/path';
import type { Lang } from '@/harness/route';
import type { CorrectionResult } from '@/harness/tutor';
import type { AnswerChecks } from '@/harness/verify';
import { useI18n } from '@/i18n';
import { localizeGrammar } from '@/i18n/content';
import { cards, describeError, tutor, useModel } from '@/model/runtime';
import { useAuthored } from '@/state/authored';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { CheckFooter } from '@/ui/CheckFooter';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { Button, Paper, Pill, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { Markdown } from '@/ui/Markdown';
import { ParadigmDrill, ParadigmTable } from '@/ui/ParadigmTable';
import { RedPen } from '@/ui/RedPen';
import { RuleLines } from '@/ui/RuleLines';
import { Section, TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

type Stream = { status: 'idle' | 'thinking' | 'streaming' | 'done' | 'error'; text: string; checks?: AnswerChecks; error?: string };

function useModelText() {
  const [state, setState] = useState<Stream>({ status: 'idle', text: '' });
  const run = useCallback(async (call: (onText: (t: string) => void) => Promise<{ text: string; checks: AnswerChecks }>) => {
    setState({ status: 'thinking', text: '' });
    try {
      const r = await call((t) => setState({ status: 'streaming', text: t }));
      setState({ status: 'done', text: r.text, checks: r.checks });
    } catch (e) {
      setState({ status: 'error', text: '', error: describeError(e) });
    }
  }, []);
  return [state, run] as const;
}

function ModelBlock({ state, lang }: { state: Stream; lang: Lang }) {
  const { c } = useTheme();
  if (state.status === 'idle') return null;
  return (
    <View>
      {state.status === 'thinking' ? <Thinking /> : null}
      {state.status === 'error' ? (
        <Txt variant="small" style={{ color: c.red }}>
          {state.error}
        </Txt>
      ) : null}
      {state.text ? <Markdown text={state.text} lang={lang} streaming={state.status === 'streaming'} onWord={(l) => router.push(`/word/${encodeURIComponent(l)}`)} /> : null}
      {state.status === 'done' && state.checks ? <CheckFooter checks={state.checks} noteTitle={tutor.noteTitle} /> : null}
    </View>
  );
}

export default function GrammarScreen() {
  const { key, lesson, path } = useLocalSearchParams<{ key: string; lesson?: string; path?: string }>();
  const own = useAuthored((s) => s.cards[key]);
  const removeCard = useAuthored((s) => s.removeCard);
  const card = own ?? cards.find((k) => k.key === key) ?? cards[0];
  const { c } = useTheme();
  const { t, lang: appLang } = useI18n();
  // the card as read by the learner; `card` itself stays English for the prompts and the drill
  const shown = localizeGrammar(card, appLang);
  // the paradigms the rule carries, as exercises (the German is the same in every language's rule)
  const tables = ruleSegments(card.rule_de).flatMap((seg) => (seg.kind === 'table' ? [seg.paradigm] : []));
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const connection = useModel((s) => s.status);
  // the rule as read, its tables lifted out; a translation that kept a paradigm in a shape the reader does not know
  // shows its text whole and the German card's tables after it
  const ruleText = explainIn === 'de' ? shown.rule_de : shown.rule_en;
  const ruleSegs = ruleSegments(ruleText);
  const ruleView: RuleSegment[] = ruleSegs.filter((seg) => seg.kind === 'table').length >= tables.length ? ruleSegs : [{ kind: 'text', text: ruleText }, ...tables.map((paradigm) => ({ kind: 'table' as const, paradigm }))];

  const pct = useModelPercent();
  const record = useProgress((s) => s.record);
  const markDone = useProgress((s) => s.markDone);
  const [lang, setLang] = useState<Lang>(explainIn);
  const [explain, runExplain] = useModelText();
  const [examples, runExamples] = useModelText();

  // exercises: the card's typical mistakes, one at a time
  const [ex, setEx] = useState(0);
  const pitfall = card.pitfalls[ex];
  const [attempt, setAttempt] = useState(pitfall?.wrong ?? '');
  const [verdict, setVerdict] = useState<{ ok: boolean; via: 'card' | 'tutor'; result?: CorrectionResult } | null>(null);
  const [checking, setChecking] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const startExplain = useCallback(
    (l: Lang) => runExplain((onText) => tutor.grammarExplain(card, { level, lang: l, onText })),
    [card, level, runExplain],
  );

  useEffect(() => {
    if (connection === 'ready' && explain.status === 'idle') void startExplain(lang);
  }, [connection, explain.status, lang, startExplain]);

  const check = async () => {
    if (!pitfall || !attempt.trim()) return;
    if (compact(attempt) === compact(pitfall.right)) {
      haptic.success();
      setVerdict({ ok: true, via: 'card' });
      setScore((s) => s + 1);
      record('grammar', true);
      return;
    }
    if (compact(attempt) === compact(pitfall.wrong)) {
      haptic.error();
      setVerdict({ ok: false, via: 'card' });
      record('grammar', false);
      return;
    }
    // a different sentence may still be right: the tutor checks it
    setChecking(true);
    try {
      const r = await tutor.grammarCheck(attempt, card, { level, lang: explainIn });
      const ok = r.correction.unchanged;
      if (ok) {
        haptic.success();
        setScore((s) => s + 1);
      } else haptic.error();
      record('grammar', ok);
      setVerdict({ ok, via: 'tutor', result: r });
    } catch (e) {
      setVerdict({ ok: false, via: 'card' });
      record('grammar', false);
      void e;
    } finally {
      setChecking(false);
    }
  };

  const nextExercise = () => {
    const n = ex + 1;
    if (n >= card.pitfalls.length) {
      setFinished(true);
      markDone(`grammar:${card.key}`);
      if (lesson !== undefined) markDone(lessonKey(Number(lesson)));
      if (path) markDone(pathDoneKey(path));
      return;
    }
    setEx(n);
    setAttempt(card.pitfalls[n].wrong);
    setVerdict(null);
  };

  return (
    <KeyboardAvoider style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar
        title={t('grammar.title')}
        right={
          own ? (
            <Button
              label={t('common.delete')}
              icon={Trash2}
              kind="quiet"
              size="small"
              onPress={() => {
                removeCard(card.key);
                router.back();
              }}
            />
          ) : null
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4 }}>
        <View style={{ marginBottom: space.xxl, gap: space.xs }}>
          <View style={{ flexDirection: 'row', gap: space.s, flexWrap: 'wrap' }}>
            <Pill label={card.level} tone="royal" />
            {own ? <Pill label={t('grammar.byYourTutor')} icon={Sparkles} tone="amber" /> : null}
          </View>
          <Txt variant="title" style={{ marginTop: space.s }}>
            {shown.title_en}
          </Txt>
          <De variant="germanLarge" style={{ color: c.inkSoft, fontSize: 20 }}>
            {card.title_de}
          </De>
        </View>

        <Section
          title={t('grammar.tutorExplains')}
          action={
            explain.status === 'done' ? (
              <Pill
                label={lang === 'en' ? t('grammar.inGerman') : t('grammar.inEnglish')}
                icon={RefreshCw}
                onPress={() => {
                  const l: Lang = lang === 'en' ? 'de' : 'en';
                  setLang(l);
                  void startExplain(l);
                }}
              />
            ) : null
          }>
          {connection !== 'ready' && explain.status === 'idle' ? (
            <Txt variant="small" color="inkSoft">
              {t('grammar.notReady', { note: notReadyNote(connection, pct, appLang) })}
            </Txt>
          ) : (
            <ModelBlock state={explain} lang={lang} />
          )}
        </Section>

        <Section title={t('grammar.theRule')}>
          <View style={{ borderLeftWidth: 3, borderLeftColor: c.amber, paddingLeft: space.l, gap: space.s }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {own ? <Sparkles size={15} color={c.amberInk} /> : <BadgeCheck size={15} color={c.amberInk} />}
              <Txt variant="caption" style={{ color: c.amberInk }}>
                {own ? t('grammar.writtenByTutorChecked') : t('grammar.verifiedRuleCard')}
              </Txt>
            </View>
            {ruleView.map((seg, i) =>
              seg.kind === 'text' ? (
                <Txt key={i} variant="body">
                  {seg.text}
                </Txt>
              ) : (
                <ParadigmTable key={i} paradigm={seg.paradigm} />
              ),
            )}
            {own?.grounded.length ? (
              <Txt variant="caption" color="inkSoft">
                {t('grammar.writtenWithNotes', { notes: own.grounded.map((k) => tutor.noteTitle(k)).join(', ') })}
              </Txt>
            ) : null}
            {own?.dropped.length ? (
              <Txt variant="caption" color="inkSoft">
                {t('grammar.leftOutExamples', { count: own.dropped.length, why: own.dropped.map((d) => d.why).join('; ') })}
              </Txt>
            ) : null}
          </View>
        </Section>

        <Section title={t('grammar.examples')}>
          <View style={{ gap: space.m }}>
            {shown.examples.map(([de, gloss]) => (
              <View key={de} style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <De variant="german" speakable>
                    {de}
                  </De>
                  <Txt variant="small" color="inkSoft">
                    {gloss}
                  </Txt>
                </View>
                <SpeakButton text={de} size={32} />
              </View>
            ))}
            {examples.status === 'idle' ? (
              <Button label={t('grammar.moreExamples')} icon={Sparkles} kind="secondary" size="medium" disabled={connection !== 'ready'} onPress={() => void runExamples((onText) => tutor.grammarExamples(card, { level, lang: explainIn, onText }))} />
            ) : (
              <Paper tone="alt">
                <ModelBlock state={examples} lang={explainIn} />
              </Paper>
            )}
          </View>
        </Section>

        {tables.length ? (
          <Section title={t('grammar.fillTheTable')}>
            <View style={{ gap: space.l }}>
              {tables.map((p, i) => (
                <ParadigmDrill key={i} paradigm={p} seed={i} />
              ))}
            </View>
          </Section>
        ) : null}

        {card.pitfalls.length ? (
          <Section title={t('grammar.fixTheSentence')} action={<Txt variant="caption" color="inkSoft">{t('grammar.counter', { n: finished ? score : ex + 1, total: card.pitfalls.length })}</Txt>}>
            {finished ? (
              <Animated.View entering={FadeIn.duration(300)}>
                <Paper tone="green" style={{ gap: space.s }}>
                  <De variant="germanLarge">{score === card.pitfalls.length ? 'Perfekt!' : 'Gut gemacht!'}</De>
                  <Txt variant="body">{t('grammar.fixedSummary', { score, count: card.pitfalls.length })}</Txt>
                  <Button label={t('grammar.backToPractice')} size="medium" onPress={() => router.back()} />
                </Paper>
              </Animated.View>
            ) : pitfall ? (
              <Animated.View key={ex} entering={FadeInDown.duration(240)} style={{ gap: space.m }}>
                <Txt variant="small" color="inkSoft">
                  {t('grammar.correctIt')}
                </Txt>
                <De variant="german" style={{ fontSize: 19, textDecorationLine: verdict ? 'none' : 'underline', textDecorationColor: c.red, textDecorationStyle: 'dotted' }}>
                  {pitfall.wrong}
                </De>
                <TextInput
                  value={attempt}
                  onChangeText={(text) => {
                    setAttempt(text);
                    if (verdict) setVerdict(null);
                  }}
                  editable={!verdict && !checking}
                  multiline
                  autoCorrect={false}
                  autoCapitalize="sentences"
                  spellCheck={false}
                  accessibilityLabel={t('grammar.correctedSentenceA11y')}
                  style={{ fontFamily: font.de, fontSize: 19, lineHeight: 26, color: c.royal, backgroundColor: c.sheet, borderRadius: radius.control, borderWidth: 1.5, borderColor: verdict ? (verdict.ok ? c.green : c.red) : c.rule, padding: space.l, minHeight: 64, outlineStyle: 'none' } as object}
                />
                {checking ? <Thinking label={t('grammar.checkingSentence')} /> : null}
                {verdict ? (
                  <Animated.View entering={FadeInDown.duration(220)} style={{ gap: space.m }}>
                    <Paper tone={verdict.ok ? 'green' : 'red'} style={{ gap: space.s }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                        {verdict.ok ? <Check size={18} color={c.green} strokeWidth={2.8} /> : <X size={18} color={c.red} strokeWidth={2.8} />}
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
                        {explainIn === 'de' ? pitfall.why_de : shown.pitfalls[ex].why_en}
                      </Txt>
                    </Paper>
                    {verdict.via === 'tutor' && verdict.result && !verdict.ok ? (
                      <View style={{ gap: space.s }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <MessageCircle size={14} color={c.inkSoft} />
                          <Txt variant="caption" color="inkSoft">
                            {t('grammar.tutorOnYourVersion')}
                          </Txt>
                        </View>
                        <RedPen original={attempt} corrected={verdict.result.correction.corrected} diff={verdict.result.diff} unchanged={verdict.result.correction.unchanged} />
                        {verdict.result.correction.explanation ? <Markdown text={verdict.result.correction.explanation} lang={explainIn} compact /> : null}
                        <RuleLines rules={verdict.result.rules} compact />
                      </View>
                    ) : null}
                    <Button label={ex + 1 >= card.pitfalls.length ? t('grammar.finish') : t('grammar.nextSentence')} onPress={nextExercise} />
                  </Animated.View>
                ) : (
                  <Button label={t('grammar.check')} onPress={() => void check()} disabled={!attempt.trim() || checking} loading={checking} />
                )}
              </Animated.View>
            ) : null}
          </Section>
        ) : null}
      </ScrollView>
    </KeyboardAvoider>
  );
}
