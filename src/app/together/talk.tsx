import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeftRight, Check, ChevronRight, PenLine, Pencil, RotateCcw, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { notReadyNote, useModelPercent } from '@/features/modelStatus';
import { PlayerNames } from '@/features/PlayerNames';
import { playerName, topicLabel, useTogether } from '@/features/together';
import type { DiffOp } from '@/harness/diff';
import { LEVELS, type Level } from '@/harness/levels';
import type { RuleHit } from '@/harness/rules';
import { askerOf, keyWords, pointGloss, TALK_TOPICS, talkPoints, type TalkPoint, type TalkTopic } from '@/harness/together';
import { useI18n } from '@/i18n';
import { wordMeaning } from '@/i18n/content';
import { coreLexicon, describeError, tutor, useModel } from '@/model/runtime';
import { useTranslated } from '@/mt';
import { useSettings } from '@/state/settings';
import { Composer } from '@/ui/Composer';
import { Button, GenderChip, IconButton, Paper, Press, ProgressBar, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { RedPen } from '@/ui/RedPen';
import { RuleLines } from '@/ui/RuleLines';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { gutter, radius, space, useTheme } from '@/ui/theme';

interface CheckState {
  status: 'idle' | 'checking' | 'done' | 'error';
  original?: string;
  corrected?: string | null;
  unchanged?: boolean;
  diff?: DiffOp[] | null;
  note?: string;
  rules?: RuleHit[];
  error?: string;
}

function firstSentence(md: string) {
  const line = md
    .split('\n')
    .map((l) => l.replace(/\*\*|__|[*_`#>]/g, '').trim())
    .find((l) => l.length > 3);
  return line ?? '';
}

/** The level's own questions first, then the easier ones as a reserve, so a session has more than three cards. */
function pointsFor(topic: TalkTopic, level: Level): TalkPoint[] {
  const idx = LEVELS.indexOf(level);
  const lower = LEVELS.slice(0, idx).reverse();
  return [...talkPoints(topic, level), ...lower.flatMap((l) => talkPoints(topic, l))];
}

export default function TalkScreen() {
  const params = useLocalSearchParams<{ topic: string; level: Level }>();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const learnerLevel = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const level: Level = params.level && LEVELS.includes(params.level) ? params.level : learnerLevel;
  const topic = (TALK_TOPICS as readonly string[]).includes(params.topic) ? (params.topic as TalkTopic) : 'custom';
  const custom = useTogether((s) => s.custom);
  const names = useTogether((s) => s.names);
  const finished = useTogether((s) => s.finished);
  const status = useModel((s) => s.status);
  const pct = useModelPercent();
  const points = useMemo(() => (topic === 'custom' ? (custom?.points ?? []) : pointsFor(topic, level)), [topic, level, custom]);
  const title = topicLabel(topic, t, custom?.title ?? '');
  const [index, setIndex] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const [naming, setNaming] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [text, setText] = useState('');
  const [check, setCheck] = useState<CheckState>({ status: 'idle' });
  const [ended, setEnded] = useState(false);

  const point = points[index];
  const asker = ((askerOf(index) + (swapped ? 1 : 0)) % 2) as 0 | 1;
  const answerer = (1 - asker) as 0 | 1;
  const name = (p: 0 | 1) => playerName(names, p, (n) => t('together.playerN', { n }));
  const lex = tutor.lexicon ?? coreLexicon;
  const words = point ? keyWords(point, lex) : [];
  const gloss = point ? pointGloss(point, lang) : null;
  // an English gloss is translated on this phone when the learner turned that on; the bundled fr/es/it glosses show as they are
  const shown = useTranslated(gloss?.lang === 'en' && lang !== 'en' ? gloss.text : undefined, { from: 'en', to: lang });
  const glossText = gloss ? (gloss.lang === 'en' && lang !== 'en' ? shown.text || gloss.text : gloss.text) : null;

  const next = () => {
    haptic.tap();
    setCheckOpen(false);
    setCheck({ status: 'idle' });
    setText('');
    if (index + 1 >= points.length) {
      finished('talk');
      setEnded(true);
    } else setIndex(index + 1);
  };

  const again = () => {
    setIndex(0);
    setEnded(false);
    setSwapped(false);
  };

  const send = async (raw: string) => {
    const line = raw.trim();
    if (!line || check.status === 'checking') return;
    setCheck({ status: 'checking', original: line });
    haptic.soft();
    try {
      const r = await tutor.correct(line, { level, lang: explainIn });
      setCheck({
        status: 'done',
        original: line,
        unchanged: r.correction.unchanged || !r.correction.corrected,
        corrected: r.correction.corrected,
        diff: r.diff,
        note: firstSentence(r.correction.explanation),
        rules: r.rules,
      });
      setText('');
    } catch (e) {
      setCheck({ status: 'error', original: line, error: describeError(e) });
    }
  };

  if (!points.length) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        <TopBar title={title} />
        <View style={{ padding: gutter }}>
          <Txt variant="body" color="inkSoft">
            {t('together.noQuestions')}
          </Txt>
        </View>
      </View>
    );
  }

  if (ended) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.l }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, gap: space.xl }}>
          <Animated.View entering={ZoomIn.duration(400)} style={{ alignItems: 'center', marginTop: space.x3, gap: space.m }}>
            <View style={{ width: 132, height: 132, borderRadius: 66, borderWidth: 6, borderColor: c.green, alignItems: 'center', justifyContent: 'center' }}>
              <Txt variant="title" style={{ fontSize: 40, lineHeight: 46 }}>
                {points.length}
              </Txt>
            </View>
            <De variant="display">{t('together.talkDoneTitle')}</De>
            <Txt variant="body" color="inkSoft" center>
              {t('together.talkDoneDetail', { count: points.length, topic: title })}
            </Txt>
          </Animated.View>
          <View style={{ gap: space.s }}>
            <Button label={t('together.again')} icon={RotateCcw} onPress={again} />
            <Button label={t('together.anotherTopic')} kind="secondary" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoider style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ paddingTop: insets.top + space.xs, paddingHorizontal: space.m, flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <IconButton icon={X} label={t('common.close')} onPress={() => router.back()} tone="sheet" size={38} />
        <View style={{ flex: 1 }}>
          <ProgressBar value={(index + 1) / points.length} />
        </View>
        <Txt variant="caption" color="inkSoft" style={{ minWidth: 38, textAlign: 'right' }}>
          {t('drill.progress', { current: index + 1, total: points.length })}
        </Txt>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
        <Txt variant="smallStrong" color="inkSoft" style={{ marginTop: space.l }}>
          {title} · {point.level}
        </Txt>

        <Paper tone="royal" style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="bodyStrong">{t('together.asks', { name: name(asker) })}</Txt>
            <Txt variant="small" color="inkSoft">
              {t('together.answers', { name: name(answerer) })}
            </Txt>
          </View>
          <IconButton icon={Pencil} label={t('together.editNames')} onPress={() => setNaming((n) => !n)} tone={naming ? 'filled' : 'sheet'} size={38} />
          <IconButton icon={ArrowLeftRight} label={t('together.swap')} onPress={() => setSwapped((s) => !s)} tone="sheet" size={38} />
        </Paper>
        {naming ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <PlayerNames autoFocus />
          </Animated.View>
        ) : null}

        <Animated.View key={point.q} entering={FadeInDown.duration(260)} style={{ gap: space.m }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.m }}>
            <De variant="germanLarge" style={{ flex: 1 }}>
              {point.q}
            </De>
            <SpeakButton text={point.q} />
          </View>
          {glossText ? (
            <Txt variant="body" color="inkSoft">
              {glossText}
            </Txt>
          ) : null}
        </Animated.View>

        {words.length ? (
          <View style={{ gap: space.s }}>
            <Txt variant="caption" color="inkFaint">
              {t('together.keyWords')}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {words.map((w) => (
                <Press key={w.lemma} onPress={() => router.push(`/word/${encodeURIComponent(w.lemma)}`)} accessibilityLabel={w.lemma} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, backgroundColor: c.sheet, borderRadius: radius.control, borderWidth: 1, borderColor: c.rule, paddingVertical: space.s, paddingHorizontal: space.m }}>
                  {w.article ? <GenderChip article={w.article} size="small" /> : null}
                  <View>
                    <De variant="german" style={{ fontSize: 17, lineHeight: 22 }}>
                      {w.lemma}
                    </De>
                    {w.meaning && lang !== 'de' ? (
                      <Txt variant="caption" color="inkSoft">
                        {wordMeaning(w.lemma, w.meaning, lang)}
                      </Txt>
                    ) : null}
                  </View>
                </Press>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: space.m }}>
          {!checkOpen ? (
            <Button label={t('together.checkSentence')} kind="secondary" icon={PenLine} size="medium" onPress={() => setCheckOpen(true)} />
          ) : (
            <Animated.View entering={FadeIn.duration(200)} style={{ gap: space.m }}>
              <Txt variant="small" color="inkSoft">
                {status === 'ready' ? t('together.checkHint') : notReadyNote(status, pct, lang)}
              </Txt>
              <Composer value={text} onChange={setText} onSend={() => send(text)} busy={check.status === 'checking'} placeholder={t('together.checkPlaceholder')} german disabled={status !== 'ready'} />
              {check.status === 'checking' ? <Thinking label={t('scene.checkingGerman')} /> : null}
              {check.status === 'error' ? (
                <Txt variant="small" style={{ color: c.red }}>
                  {check.error}
                </Txt>
              ) : null}
              {check.status === 'done' && check.unchanged ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Check size={16} color={c.green} strokeWidth={2.6} />
                  <De variant="german" style={{ flex: 1 }}>
                    {check.original}
                  </De>
                  <Txt variant="caption" style={{ color: c.green }}>
                    {t('scene.correctGerman')}
                  </Txt>
                </View>
              ) : null}
              {check.status === 'done' && !check.unchanged && check.corrected && check.original ? (
                <View style={{ gap: space.s }}>
                  <RedPen original={check.original} corrected={check.corrected} diff={check.diff ?? null} unchanged={false} />
                  {check.rules?.length ? (
                    <RuleLines rules={check.rules} compact />
                  ) : check.note ? (
                    <Txt variant="small" color="inkSoft">
                      {check.note}
                    </Txt>
                  ) : null}
                </View>
              ) : null}
            </Animated.View>
          )}
          <Button label={index + 1 >= points.length ? t('together.finish') : t('together.nextQuestion')} icon={ChevronRight} onPress={next} />
        </View>
      </ScrollView>
    </KeyboardAvoider>
  );
}
