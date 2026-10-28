import { router, useLocalSearchParams } from 'expo-router';
import { BookOpen, Check, Pencil, RotateCcw } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFieldDictation } from '@/features/dictation';
import { notReadyNote, useModelPercent } from '@/features/modelStatus';
import { PlayerNames } from '@/features/PlayerNames';
import { playerName, useTogether } from '@/features/together';
import { diffWords } from '@/harness/diff';
import { makeRng } from '@/harness/drills';
import { LEVELS, type Level } from '@/harness/levels';
import { storyOpener, storyText, storyTurn, type StoryLine } from '@/harness/together';
import { useI18n } from '@/i18n';
import { describeError, tutor, useModel } from '@/model/runtime';
import { useSettings } from '@/state/settings';
import { Composer } from '@/ui/Composer';
import { Button, IconButton, Paper, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { RedPen } from '@/ui/RedPen';
import { RuleLines } from '@/ui/RuleLines';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { gutter, space, useTheme } from '@/ui/theme';

const MIN_LINES = 4;
const opener = (level: Level): StoryLine => ({ id: `opener-${Date.now()}`, player: null, text: storyOpener(level, makeRng(Date.now())) });

function firstSentence(md: string) {
  const line = md
    .split('\n')
    .map((l) => l.replace(/\*\*|__|[*_`#>]/g, '').trim())
    .find((l) => l.length > 3);
  return line ?? '';
}

export default function StoryScreen() {
  const params = useLocalSearchParams<{ level?: Level }>();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const learnerLevel = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const level: Level = params.level && LEVELS.includes(params.level) ? params.level : learnerLevel;
  const names = useTogether((s) => s.names);
  const finished = useTogether((s) => s.finished);
  const name = (p: 0 | 1) => playerName(names, p, (n) => t('together.playerN', { n }));
  const status = useModel((s) => s.status);
  const pct = useModelPercent();

  const [lines, setLines] = useState<StoryLine[]>(() => [opener(level)]);
  const [text, setText] = useState('');
  const dictation = useFieldDictation(text, setText);
  const [ended, setEnded] = useState(false);
  const [naming, setNaming] = useState(false);
  const input = useRef<TextInput>(null);
  const scroll = useRef<ScrollView>(null);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(0);

  const turn = storyTurn(lines);
  const written = lines.length - 1;
  const checking = lines.some((l) => l.check?.status === 'checking');
  const fixedLines = lines.filter((l) => l.check?.status === 'done' && l.check.corrected && !l.check.unchanged);
  const corrections = fixedLines.length;
  const patch = (id: string, check: StoryLine['check']) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, check } : l)));

  const check = async (id: string, line: string) => {
    const controller = new AbortController();
    abort.current = controller;
    patch(id, { status: 'checking' });
    try {
      const r = await tutor.correct(line, { level, lang: explainIn, signal: controller.signal });
      patch(id, {
        status: 'done',
        corrected: r.correction.corrected,
        unchanged: r.correction.unchanged || !r.correction.corrected,
        diff: r.diff,
        note: firstSentence(r.correction.explanation),
        rules: r.rules,
      });
    } catch (e) {
      patch(id, controller.signal.aborted ? { status: 'off' } : { status: 'error', note: describeError(e) });
    }
    if (!controller.signal.aborted) checkWaiting(id);
  };

  // lines written while the model was still loading are checked one by one once it is ready: after each
  // check, and when the model store reports it ready
  const latest = useRef({ lines, ended });
  useEffect(() => {
    latest.current = { lines, ended };
  }, [lines, ended]);
  const checkWaiting = (after?: string) => {
    if (useModel.getState().status !== 'ready' || latest.current.ended) return;
    const rest = latest.current.lines.filter((l) => l.id !== after);
    if (rest.some((l) => l.check?.status === 'checking')) return;
    const waiting = rest.find((l) => l.player !== null && l.check?.status === 'off');
    if (waiting) void check(waiting.id, waiting.text);
  };
  const onReady = useRef(checkWaiting);
  useEffect(() => {
    onReady.current = checkWaiting;
  });
  useEffect(
    () =>
      useModel.subscribe((s, prev) => {
        if (s.status === 'ready' && prev.status !== 'ready') onReady.current();
      }),
    [],
  );

  const add = (sentence: string) => {
    const line = sentence.trim();
    if (!line || checking) return;
    haptic.tap();
    nextId.current += 1;
    const id = `line-${nextId.current}`;
    const ready = status === 'ready';
    setLines((ls) => [...ls, { id, player: turn, text: line, check: { status: ready ? 'checking' : 'off' } }]);
    setText('');
    if (ready) void check(id, line);
  };


  const restart = () => {
    abort.current?.abort();
    setLines([opener(level)]);
    setText('');
    setEnded(false);
  };

  const finish = () => {
    abort.current?.abort();
    finished('story');
    setEnded(true);
  };

  if (ended) {
    const full = storyText(lines);
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top + space.l }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
          <Animated.View entering={ZoomIn.duration(400)} style={{ alignItems: 'center', marginTop: space.x3, gap: space.m }}>
            <BookOpen size={44} color={c.royal} />
            <De variant="display">{t('together.storyDoneTitle')}</De>
            <Txt variant="body" color="inkSoft" center>
              {corrections ? t('together.storyDoneFixed', { count: written, fixed: corrections }) : t('together.storyDoneDetail', { count: written })}
            </Txt>
          </Animated.View>
          <Paper style={{ gap: space.m }}>
            <De variant="german" style={{ fontSize: 19, lineHeight: 29 }} speakable>
              {full}
            </De>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <SpeakButton text={full} />
            </View>
          </Paper>
          {fixedLines.length ? (
            <View style={{ gap: space.m }}>
              <Txt variant="smallStrong" color="inkSoft">
                {t('together.storyCorrections')}
              </Txt>
              {fixedLines.map((line) => (
                <View key={line.id} style={{ gap: space.s }}>
                  <Txt variant="caption" color={line.player === 0 ? 'royal' : 'amberInk'}>
                    {name(line.player ?? 0)}
                  </Txt>
                  <RedPen original={line.text} corrected={line.check?.corrected ?? null} diff={line.check?.diff ?? diffWords(line.text, line.check?.corrected ?? line.text)} unchanged={false} />
                  {line.check?.rules?.length ? (
                    <RuleLines rules={line.check.rules} compact />
                  ) : line.check?.note ? (
                    <Txt variant="small" color="inkSoft">
                      {line.check.note}
                    </Txt>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ gap: space.s }}>
            <Button label={t('together.newStory')} icon={RotateCcw} onPress={restart} />
            <Button label={t('common.done')} kind="secondary" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoider style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar
        title={t('together.storyTitle')}
        close
        onBack={() => {
          abort.current?.abort();
          router.back();
        }}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <IconButton icon={Pencil} label={t('together.editNames')} onPress={() => setNaming((n) => !n)} tone={naming ? 'filled' : 'sheet'} size={38} />
            {written >= MIN_LINES ? <Button label={t('together.finish')} kind="quiet" size="small" onPress={finish} /> : null}
          </View>
        }
      />
      {naming ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ paddingHorizontal: gutter, paddingBottom: space.l }}>
          <PlayerNames autoFocus />
        </Animated.View>
      ) : null}
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: space.xl, gap: space.l }}
      >
        <Txt variant="small" color="inkSoft">
          {t('together.storyRules', { min: MIN_LINES })}
        </Txt>
        {lines.map((line) => {
          const fixed = line.check?.status === 'done' && line.check.corrected && !line.check.unchanged ? line.check.corrected : null;
          return (
            <Animated.View key={line.id} entering={FadeInDown.duration(240)} style={{ gap: space.xs }}>
              <Txt variant="caption" color={line.player === 0 ? 'royal' : line.player === 1 ? 'amberInk' : 'inkFaint'}>
                {line.player === null ? t('together.storyOpener') : name(line.player)}
              </Txt>
              {fixed ? (
                <View style={{ gap: space.s }}>
                  <RedPen original={line.text} corrected={fixed} diff={line.check?.diff ?? diffWords(line.text, fixed)} unchanged={false} />
                  {line.check?.rules?.length ? (
                    <RuleLines rules={line.check.rules} compact />
                  ) : line.check?.note ? (
                    <Txt variant="small" color="inkSoft">
                      {line.check.note}
                    </Txt>
                  ) : null}
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s }}>
                  <De variant="german" style={{ flex: 1 }}>
                    {line.text}
                  </De>
                  {line.check?.status === 'done' && line.check.unchanged ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Check size={16} color={c.green} strokeWidth={2.6} />
                      <Txt variant="caption" style={{ color: c.green }}>
                        {t('scene.correctGerman')}
                      </Txt>
                    </View>
                  ) : null}
                </View>
              )}
              {line.check?.status === 'off' ? (
                <Txt variant="caption" color="inkFaint">
                  {t('together.storyNotChecked')}
                </Txt>
              ) : null}
              {line.check?.status === 'checking' ? <Thinking label={t('scene.checkingGerman')} /> : null}
              {line.check?.status === 'error' && line.check.note ? (
                <Txt variant="small" style={{ color: c.red }}>
                  {line.check.note}
                </Txt>
              ) : null}
            </Animated.View>
          );
        })}
      </ScrollView>
      <Composer
        ref={input}
        value={text}
        onChange={setText}
        dictation={dictation}
        onSend={() => void add(text)}
        onStop={() => abort.current?.abort()}
        busy={checking}
        placeholder={t('together.storyPlaceholder', { name: name(turn) })}
        german
        above={
          <Txt variant="caption" color="inkFaint">
            {status === 'ready' ? t('together.storyTurn', { name: name(turn) }) : t('together.storyUnchecked', { note: notReadyNote(status, pct, lang) })}
          </Txt>
        }
      />
    </KeyboardAvoider>
  );
}
