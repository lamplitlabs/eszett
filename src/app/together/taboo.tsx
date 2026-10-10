import { router, useLocalSearchParams } from 'expo-router';
import { Check, RotateCcw, SkipForward, Timer, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerNames } from '@/features/PlayerNames';
import { playerName, useTogether } from '@/features/together';
import { makeRng } from '@/harness/drills';
import { LEVELS, type Level } from '@/harness/levels';
import { TABOO_SECONDS, tabooCards, type TabooCard } from '@/harness/together';
import { useI18n } from '@/i18n';
import { wordMeaning } from '@/i18n/content';
import { coreLexicon, isReady, tutor } from '@/model/runtime';
import { useSettings } from '@/state/settings';
import { Button, GenderChip, IconButton, Paper, Pill, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { gutter, radius, space, useTheme } from '@/ui/theme';

type Phase = 'setup' | 'ready' | 'playing' | 'timeUp' | 'done';

export default function TabooScreen() {
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

  const [phase, setPhase] = useState<Phase>('setup');
  const [explainer, setExplainer] = useState<0 | 1>(0);
  const [cards, setCards] = useState<TabooCard[]>([]);
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(TABOO_SECONDS);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [turns, setTurns] = useState(0);
  const [got, setGot] = useState(0);
  const requested = useRef(new Set<string>());
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    return () => controller.abort();
  }, []);

  // the tutor writes the forbidden words of the cards that have none, this one and the next, while the players talk
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'ready') return;
    for (const card of cards.slice(index, index + 2)) {
      if (card.forbidden.length || requested.current.has(card.word) || !isReady()) continue;
      requested.current.add(card.word);
      tutor
        .tabooWords(card, { level, lang: explainIn, signal: abort.current?.signal })
        .then((words) => {
          if (words) setCards((cs) => cs.map((x) => (x.word === card.word && !x.forbidden.length ? { ...x, forbidden: words } : x)));
        })
        .catch(() => {
          // the round is playable without forbidden words
        });
    }
  }, [cards, index, phase, level, explainIn]);

  // the clock lives in a ref so the interval callback, not the effect body, ends the turn
  const left = useRef(TABOO_SECONDS);
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => {
      left.current -= 1;
      setSeconds(left.current);
      if (left.current <= 0) {
        clearInterval(id);
        haptic.error();
        setPhase('timeUp');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const deal = (first: 0 | 1) => {
    const lex = tutor.lexicon ?? coreLexicon;
    requested.current.clear();
    setCards(tabooCards(level, lex, makeRng(Date.now()), 24));
    setIndex(0);
    setScores([0, 0]);
    setTurns(0);
    setGot(0);
    setExplainer(first);
    setPhase('ready');
  };

  const begin = () => {
    haptic.tap();
    left.current = TABOO_SECONDS;
    setSeconds(TABOO_SECONDS);
    setGot(0);
    setPhase('playing');
  };

  const advance = (guessed: boolean) => {
    if (guessed) {
      haptic.success();
      setGot((g) => g + 1);
      setScores((s) => {
        const next: [number, number] = [...s];
        next[explainer] += 1;
        return next;
      });
    } else haptic.soft();
    if (index + 1 >= cards.length) setPhase('timeUp');
    else setIndex(index + 1);
  };

  const swap = () => {
    const nextTurns = turns + 1;
    setTurns(nextTurns);
    if (nextTurns >= 2) {
      finished('taboo');
      setPhase('done');
      return;
    }
    // the card the clock ran out on is burnt: the explainer has seen it, so the other player must not get it
    if (index + 1 >= cards.length) {
      requested.current.clear();
      setCards(tabooCards(level, tutor.lexicon ?? coreLexicon, makeRng(Date.now()), 24));
      setIndex(0);
    } else setIndex(index + 1);
    setExplainer((e) => (1 - e) as 0 | 1);
    setPhase('ready');
  };

  const card = cards[index];
  const meaning = card?.meaning && lang !== 'de' ? wordMeaning(card.word, card.meaning, lang) : null;

  if (phase === 'setup') {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        <TopBar title={t('together.tabooTitle')} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
          <Txt variant="body" color="inkSoft">
            {t('together.tabooRules', { seconds: TABOO_SECONDS })}
          </Txt>
          <PlayerNames />
          <View style={{ gap: space.s }}>
            <Txt variant="smallStrong" color="inkSoft">
              {t('together.tabooFirst')}
            </Txt>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              {([0, 1] as const).map((p) => (
                <Pill key={p} label={name(p)} selected={p === explainer} onPress={() => setExplainer(p)} />
              ))}
            </View>
          </View>
          <Button label={t('together.start')} onPress={() => deal(explainer)} />
        </ScrollView>
      </View>
    );
  }

  if (phase === 'done') {
    const total = scores[0] + scores[1];
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.l }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, gap: space.xl }}>
          <Animated.View entering={ZoomIn.duration(400)} style={{ alignItems: 'center', marginTop: space.x3, gap: space.m }}>
            <View style={{ width: 132, height: 132, borderRadius: 66, borderWidth: 6, borderColor: c.green, alignItems: 'center', justifyContent: 'center' }}>
              <Txt variant="title" style={{ fontSize: 40, lineHeight: 46 }}>
                {total}
              </Txt>
            </View>
            <De variant="display">{t('together.tabooDoneTitle')}</De>
            <Txt variant="body" color="inkSoft" center>
              {t('together.tabooDoneDetail', { a: name(0), sa: scores[0], b: name(1), sb: scores[1] })}
            </Txt>
          </Animated.View>
          <View style={{ gap: space.s }}>
            <Button label={t('together.again')} icon={RotateCcw} onPress={() => deal(explainer)} />
            <Button label={t('common.done')} kind="secondary" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ paddingTop: insets.top + space.xs, paddingHorizontal: space.m, flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <IconButton icon={X} label={t('common.close')} onPress={() => router.back()} tone="sheet" size={38} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="smallStrong">{t('together.tabooTitle')}</Txt>
        </View>
        <Txt variant="smallStrong" color="inkSoft" style={{ minWidth: 38, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
          {scores[0]} · {scores[1]}
        </Txt>
      </View>
      <ScrollView contentContainerStyle={{ padding: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
        <Paper tone={explainer === 0 ? 'royal' : 'amber'} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="bodyStrong">{t('together.explains', { name: name(explainer) })}</Txt>
            <Txt variant="small" color="inkSoft">
              {t('together.guesses', { name: name((1 - explainer) as 0 | 1) })}
            </Txt>
          </View>
          {phase === 'playing' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Timer size={16} color={seconds <= 10 ? c.red : c.inkSoft} />
              <Txt variant="headline" style={{ color: seconds <= 10 ? c.red : c.ink, fontVariant: ['tabular-nums'] }}>
                {seconds}
              </Txt>
            </View>
          ) : null}
        </Paper>

        {phase === 'ready' ? (
          <View style={{ gap: space.l, marginTop: space.xl }}>
            <Txt variant="body" color="inkSoft" center>
              {t('together.tabooReady', { name: name(explainer), seconds: TABOO_SECONDS })}
            </Txt>
            <Button label={t('together.go')} onPress={begin} />
          </View>
        ) : null}

        {phase === 'playing' && card ? (
          <Animated.View key={card.word} entering={FadeInDown.duration(220)} style={{ gap: space.l }}>
            <Paper style={{ gap: space.m, alignItems: 'center', paddingVertical: space.x3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                {card.article ? <GenderChip article={card.article} size="large" /> : null}
                <De variant="cue" fit style={{ fontSize: 34, lineHeight: 40, flexShrink: 1 }}>
                  {card.word}
                </De>
                <SpeakButton text={card.article ? `${card.article} ${card.word}` : card.word} tone="plain" />
              </View>
              {meaning ? (
                <Txt variant="small" color="inkSoft">
                  {meaning}
                </Txt>
              ) : null}
              <View style={{ width: '100%', height: 1, backgroundColor: c.rule }} />
              {card.forbidden.length ? (
                <View style={{ gap: space.xs, alignItems: 'center' }}>
                  <Txt variant="caption" style={{ color: c.red }}>
                    {t('together.forbidden')}
                  </Txt>
                  {card.forbidden.map((w) => (
                    <De key={w} variant="germanStrong" style={{ color: c.red, fontSize: 20, lineHeight: 26 }}>
                      {w}
                    </De>
                  ))}
                </View>
              ) : (
                <Txt variant="small" color="inkFaint" center>
                  {t('together.noForbidden')}
                </Txt>
              )}
            </Paper>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button label={t('together.skip')} kind="secondary" icon={SkipForward} onPress={() => advance(false)} grow />
              <Button label={t('together.guessed')} icon={Check} onPress={() => advance(true)} grow />
            </View>
            <Txt variant="caption" color="inkFaint" center>
              {t('together.gotThisTurn', { count: got })}
            </Txt>
          </Animated.View>
        ) : null}

        {phase === 'timeUp' ? (
          <Animated.View entering={ZoomIn.duration(300)} style={{ gap: space.l, marginTop: space.xl, alignItems: 'center' }}>
            <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: c.sheet, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: c.amber, borderStyle: 'solid' }}>
              <Txt variant="title" style={{ fontSize: 36, lineHeight: 42 }}>
                {got}
              </Txt>
            </View>
            <De variant="display">{t('together.timeUp')}</De>
            <Txt variant="body" color="inkSoft" center>
              {t('together.wordsGuessed', { name: name(explainer), count: got })}
            </Txt>
            <View style={{ width: '100%', borderRadius: radius.control }}>
              <Button label={turns + 1 >= 2 ? t('together.seeResult') : t('together.swapRoles', { name: name((1 - explainer) as 0 | 1) })} onPress={swap} />
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}
