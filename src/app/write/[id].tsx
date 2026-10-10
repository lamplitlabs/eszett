import { router, useLocalSearchParams } from 'expo-router';
import { Check, Circle, FileText, Languages, Sparkles, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lessonKey } from '@/features/lesson';
import { notReadyNote, useModelPercent } from '@/features/modelStatus';
import type { Answer, WritingResult } from '@/harness/tutor';
import { precheckText, WRITE_TASKS } from '@/harness/writing';
import { useI18n } from '@/i18n';
import { localizeWriting } from '@/i18n/content';
import { describeError, tutor, useModel } from '@/model/runtime';
import { useAuthored } from '@/state/authored';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { CheckFooter } from '@/ui/CheckFooter';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { Button, Paper, Pill } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { Markdown } from '@/ui/Markdown';
import { Heft, RedPen } from '@/ui/RedPen';
import { RuleLines } from '@/ui/RuleLines';
import { Section, TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { font, gutter, space, useTheme } from '@/ui/theme';

function Tick({ ok, label }: { ok: boolean; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
      {ok ? <Check size={16} color={c.green} strokeWidth={2.8} /> : <Circle size={16} color={c.inkFaint} strokeWidth={2} />}
      <Txt variant="small" style={{ color: ok ? c.ink : c.inkSoft }}>
        {label}
      </Txt>
    </View>
  );
}

export default function WriteScreen() {
  const { id, lesson } = useLocalSearchParams<{ id: string; lesson?: string }>();
  const own = useAuthored((s) => s.tasks[id]);
  const removeTask = useAuthored((s) => s.removeTask);
  const task = own ?? WRITE_TASKS.find((t) => t.id === id) ?? WRITE_TASKS[0];
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const connection = useModel((s) => s.status);
  const pct = useModelPercent();
  const record = useProgress((s) => s.record);
  const markDone = useProgress((s) => s.markDone);
  const [text, setText] = useState('');
  const [showGerman, setShowGerman] = useState(false);
  const [state, setState] = useState<{ status: 'idle' | 'thinking' | 'streaming' | 'done' | 'error'; stream: string; result?: WritingResult; error?: string }>({ status: 'idle', stream: '' });
  const [model, setModel] = useState<{ status: 'idle' | 'thinking' | 'streaming' | 'done' | 'error'; text: string; answer?: Answer; error?: string }>({ status: 'idle', text: '' });
  const shown = localizeWriting(task, lang);
  const pre = useMemo(() => precheckText(task, text), [task, text]);
  const [lo, hi] = task.words;

  const submit = async () => {
    setState({ status: 'thinking', stream: '' });
    try {
      const result = await tutor.writing(task, text, { level, lang: explainIn, onText: (t) => setState({ status: 'streaming', stream: t }) });
      setState({ status: 'done', stream: '', result });
      record('writing', result.precheck.ok && Boolean(result.correction?.correction.unchanged));
      markDone(`write:${task.id}`);
      if (lesson !== undefined) markDone(lessonKey(Number(lesson)));
      haptic.success();
    } catch (e) {
      setState({ status: 'error', stream: '', error: describeError(e) });
    }
  };

  const showModel = async () => {
    setModel({ status: 'thinking', text: '' });
    try {
      const answer = await tutor.modelAnswer(task, { level, lang: explainIn, onText: (t) => setModel({ status: 'streaming', text: t }) });
      setModel({ status: 'done', text: answer.text, answer });
    } catch (e) {
      setModel({ status: 'error', text: '', error: describeError(e) });
    }
  };

  const result = state.result;
  const correction = result?.correction;

  return (
    <KeyboardAvoider style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar
        title={t('write.title')}
        right={
          own ? (
            <Button
              label={t('common.delete')}
              icon={Trash2}
              kind="quiet"
              size="small"
              onPress={() => {
                removeTask(task.id);
                router.back();
              }}
            />
          ) : null
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4 }}>
        <View style={{ flexDirection: 'row', gap: space.s, marginBottom: space.s, flexWrap: 'wrap' }}>
          <Pill label={task.level} tone="royal" />
          <Pill label={task.register === 'formal' ? t('write.formal') : t('write.informal')} />
          <Pill label={t('write.wordRange', { lo, hi })} />
          {own ? <Pill label={t('write.byTutor')} icon={Sparkles} tone="amber" /> : null}
        </View>
        <Txt variant="title" style={{ marginBottom: space.m }}>
          {shown.title}
        </Txt>
        {showGerman || shown.prompt === task.promptDe ? (
          <De variant="german" style={{ marginBottom: space.s }}>
            {task.promptDe}
          </De>
        ) : (
          <Txt variant="body" style={{ marginBottom: space.s }}>
            {shown.prompt}
          </Txt>
        )}
        {shown.prompt !== task.promptDe ? (
          <Pill label={showGerman ? t('write.taskInEnglish') : t('write.taskInGerman')} icon={Languages} onPress={() => setShowGerman((g) => !g)} />
        ) : null}

        <View style={{ marginTop: space.xl, marginBottom: space.m }}>
          <Heft minLines={7}>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              editable={state.status !== 'thinking' && state.status !== 'streaming'}
              placeholder={task.register === 'formal' ? 'Sehr geehrte …' : 'Liebe … / Hallo …'}
              placeholderTextColor={c.inkFaint}
              autoCorrect={false}
              spellCheck={false}
              accessibilityLabel={t('write.yourText')}
              style={{ fontFamily: font.deItalic, fontSize: 20, lineHeight: 34, color: c.royal, minHeight: 34 * 6, textAlignVertical: 'top', paddingTop: 0, outlineStyle: 'none' } as object}
            />
          </Heft>
        </View>

        <Paper tone="alt" style={{ gap: space.s, marginBottom: space.xl }}>
          <Tick ok={pre.inBand} label={t('write.wordCount', { count: pre.words, lo, hi })} />
          {pre.points.map((p, i) => (
            <Tick key={p.en} ok={p.hit} label={t('write.sayPoint', { point: shown.points[i]?.en ?? p.en })} />
          ))}
          <Tick ok={pre.opening} label={task.register === 'formal' ? t('write.openFormal') : t('write.openInformal')} />
          <Tick ok={pre.closing} label={task.register === 'formal' ? t('write.closeFormal') : t('write.closeInformal')} />
          {pre.noDu !== null ? <Tick ok={pre.noDu} label={t('write.noDu')} /> : null}
        </Paper>

        <Button
          label={t('write.checkWithTutor')}
          icon={FileText}
          onPress={() => void submit()}
          disabled={pre.words < 5 || connection !== 'ready'}
          loading={state.status === 'thinking' || state.status === 'streaming'}
        />
        {connection !== 'ready' ? (
          <Txt variant="small" color="inkSoft" center style={{ marginTop: space.s }}>
            {t('write.checklistWorks', { note: notReadyNote(connection, pct, lang) })}
          </Txt>
        ) : null}

        {state.status === 'thinking' ? (
          <View style={{ marginTop: space.xl }}>
            <Thinking label={t('write.tutorReading')} />
          </View>
        ) : null}
        {state.status === 'streaming' ? (
          <View style={{ marginTop: space.xl }}>
            <Markdown text={state.stream} streaming lang={explainIn} />
          </View>
        ) : null}
        {state.status === 'error' ? (
          <Txt variant="small" style={{ color: c.red, marginTop: space.l }}>
            {state.error}
          </Txt>
        ) : null}

        {result ? (
          <Animated.View entering={FadeInDown.duration(280)} style={{ marginTop: space.x3 }}>
            <Section title={t('write.corrections')}>
              {result.precheck.tooShort ? (
                <Txt variant="body" color="inkSoft">
                  {t('write.tooShort')}
                </Txt>
              ) : null}
              {correction ? (
                <View style={{ gap: space.l }}>
                  <RedPen original={text} corrected={correction.correction.corrected} diff={correction.diff} unchanged={correction.correction.unchanged} />
                  {correction.correction.explanation ? <Markdown text={correction.correction.explanation} lang={explainIn} onWord={(l) => router.push(`/word/${encodeURIComponent(l)}`)} /> : null}
                  <RuleLines rules={correction.rules} />
                  <CheckFooter checks={correction.checks} noteTitle={tutor.noteTitle} />
                </View>
              ) : null}
            </Section>
          </Animated.View>
        ) : null}

        <Section title={t('write.modelAnswer')} style={{ marginTop: space.l }}>
          {model.status === 'idle' ? (
            <Button label={t('write.showModelAnswer')} icon={Sparkles} kind="secondary" disabled={connection !== 'ready'} onPress={() => void showModel()} />
          ) : null}
          {model.status === 'thinking' ? <Thinking label={t('write.tutorWriting')} /> : null}
          {model.status === 'error' ? (
            <Txt variant="small" style={{ color: c.red }}>
              {model.error}
            </Txt>
          ) : null}
          {model.text ? (
            <Paper>
              <Markdown text={model.text} lang="de" streaming={model.status === 'streaming'} />
              {model.status === 'done' && model.answer ? <CheckFooter checks={model.answer.checks} noteTitle={tutor.noteTitle} /> : null}
            </Paper>
          ) : null}
        </Section>
      </ScrollView>
    </KeyboardAvoider>
  );
}
