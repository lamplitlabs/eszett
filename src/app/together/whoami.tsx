import { router, useLocalSearchParams } from 'expo-router';
import { Check, Drama, Eye, Lightbulb, RotateCcw, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerNames } from '@/features/PlayerNames';
import { playerName, useTogether } from '@/features/together';
import { makeRng } from '@/harness/drills';
import { LEVELS, type Level } from '@/harness/levels';
import { WHOAMI_KIND_DE, WHOAMI_QUESTIONS, WHOAMI_STARTERS, whoAmICards, whoAmILemma, whoAmIScore, type WhoAmICard } from '@/harness/whoami';
import { useI18n } from '@/i18n';
import { wordMeaning } from '@/i18n/content';
import { coreLexicon, tutor } from '@/model/runtime';
import { useSettings } from '@/state/settings';
import { Button, IconButton, Paper, Pill, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { gutter, space, useTheme } from '@/ui/theme';
import { Confetti } from '@/ui/motion/Confetti';
import { CountUp } from '@/ui/motion/Numbers';

type Phase = 'setup' | 'pass' | 'playing' | 'result' | 'done';
const ROUNDS = 2;

export default function WhoAmIScreen() {
  const params = useLocalSearchParams<{ level?: Level }>();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const learnerLevel = useSettings((s) => s.level);
  const level: Level = params.level && LEVELS.includes(params.level) ? params.level : learnerLevel;
  const names = useTogether((s) => s.names);
  const finished = useTogether((s) => s.finished);
  const name = (p: 0 | 1) => playerName(names, p, (n) => t('together.playerN', { n }));

  const [phase, setPhase] = useState<Phase>('setup');
  const [holder, setHolder] = useState<0 | 1>(0);
  const [cards, setCards] = useState<WhoAmICard[]>([]);
  const [starters, setStarters] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [asked, setAsked] = useState(0);
  const [hints, setHints] = useState(0);
  const [won, setWon] = useState(false);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [round, setRound] = useState(0);

  const guesser = (1 - holder) as 0 | 1;
  const card = cards[index];

  const deal = (first: 0 | 1) => {
    const rng = makeRng();
    setCards(whoAmICards(level, rng, 12));
    setStarters(rng.shuffle(WHOAMI_STARTERS).slice(0, 5));
    setIndex(0);
    setScores([0, 0]);
    setRound(0);
    setHolder(first);
    startRound();
  };

  const startRound = () => {
    setAsked(0);
    setHints(0);
    setWon(false);
    setPhase('pass');
  };

  const answer = () => {
    haptic.tap();
    setAsked((n) => Math.min(WHOAMI_QUESTIONS, n + 1));
  };

  const hint = () => {
    if (hints >= 3) return;
    haptic.soft();
    setHints((h) => h + 1);
  };

  const end = (guessed: boolean) => {
    if (guessed) {
      haptic.success();
      setScores((s) => {
        const next: [number, number] = [...s];
        next[guesser] += whoAmIScore(asked, hints);
        return next;
      });
    } else haptic.error();
    setWon(guessed);
    setPhase('result');
  };

  const next = () => {
    const nextRound = round + 1;
    setRound(nextRound);
    if (nextRound >= ROUNDS) {
      finished('whoami');
      setPhase('done');
      return;
    }
    setIndex((i) => (i + 1) % Math.max(1, cards.length));
    setHolder(guesser);
    startRound();
  };

  const lemma = card ? whoAmILemma(card) : '';
  const noun = card && card.kind !== 'person' ? (tutor.lexicon ?? coreLexicon).noun(lemma) : undefined;
  const gloss = noun?.meaning && lang !== 'de' ? wordMeaning(lemma, noun.meaning, lang) : null;
  // the forms the keeper should accept, without the lemma itself or a form that only adds an article to another
  const alsoCounts = card ? [...new Set(card.alts.map((a) => a.replace(/^(der|die|das)\s+/, '')))].filter((a) => a !== lemma) : [];
  const outOfQuestions = asked >= WHOAMI_QUESTIONS;

  if (phase === 'setup') {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        <TopBar title={t('together.whoamiTitle')} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
          <Txt variant="body" color="inkSoft">
            {t('together.whoamiRules', { total: WHOAMI_QUESTIONS })}
          </Txt>
          <PlayerNames />
          <View style={{ gap: space.s }}>
            <Txt variant="smallStrong" color="inkSoft">
              {t('together.whoamiFirst')}
            </Txt>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              {([0, 1] as const).map((p) => (
                <Pill key={p} label={name(p)} selected={p === holder} onPress={() => setHolder(p)} />
              ))}
            </View>
          </View>
          <Button label={t('together.start')} onPress={() => deal(holder)} />
        </ScrollView>
      </View>
    );
  }

  if (phase === 'done') {
    const total = scores[0] + scores[1];
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.l }}>
        <Confetti shot={`whoami-${total}`} count={60} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, gap: space.xl }}>
          <Animated.View entering={ZoomIn.duration(400)} style={{ alignItems: 'center', marginTop: space.x3, gap: space.m }}>
            <View style={{ width: 132, height: 132, borderRadius: 66, borderWidth: 6, borderColor: c.green, alignItems: 'center', justifyContent: 'center' }}>
              <CountUp value={total} style={{ fontSize: 40, lineHeight: 46 }} />
            </View>
            <De variant="display">{t('together.whoamiDoneTitle')}</De>
            <Txt variant="body" color="inkSoft" center>
              {t('together.tabooDoneDetail', { a: name(0), sa: scores[0], b: name(1), sb: scores[1] })}
            </Txt>
          </Animated.View>
          <View style={{ gap: space.s }}>
            <Button label={t('together.again')} icon={RotateCcw} onPress={() => deal(holder)} />
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
          <Txt variant="smallStrong">{t('together.whoamiTitle')}</Txt>
        </View>
        <Txt variant="smallStrong" color="inkSoft" style={{ minWidth: 38, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
          {scores[0]} · {scores[1]}
        </Txt>
      </View>
      <ScrollView contentContainerStyle={{ padding: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
        <Paper tone={holder === 0 ? 'royal' : 'amber'} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="bodyStrong">{t('together.answers', { name: name(holder) })}</Txt>
            <Txt variant="small" color="inkSoft">
              {t('together.asks', { name: name(guesser) })}
            </Txt>
          </View>
          {phase === 'playing' ? (
            <Txt variant="headline" style={{ color: outOfQuestions ? c.red : c.ink, fontVariant: ['tabular-nums'] }}>
              {asked}/{WHOAMI_QUESTIONS}
            </Txt>
          ) : null}
        </Paper>

        {phase === 'pass' ? (
          <Animated.View entering={FadeInDown.duration(220)} style={{ gap: space.l, marginTop: space.m }}>
            <Txt variant="body" color="inkSoft" center>
              {t('together.whoamiPass', { name: name(holder), other: name(guesser) })}
            </Txt>
            <Paper style={{ gap: space.s }}>
              <Txt variant="smallStrong" color="inkSoft">
                {t('together.whoamiStarters', { name: name(guesser) })}
              </Txt>
              {starters.map((q) => (
                <View key={q} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                  <De variant="german" style={{ flex: 1 }}>
                    {q}
                  </De>
                  <SpeakButton text={q} tone="plain" />
                </View>
              ))}
            </Paper>
            <Button label={t('together.whoamiShowCard')} icon={Eye} onPress={() => setPhase('playing')} />
          </Animated.View>
        ) : null}

        {phase === 'playing' && card ? (
          <Animated.View key={card.answer} entering={FadeInDown.duration(220)} style={{ gap: space.l }}>
            <Paper style={{ gap: space.m, alignItems: 'center', paddingVertical: space.x3 }}>
              <Txt variant="caption" color="inkFaint">
                {WHOAMI_KIND_DE[card.kind]} · {card.level}
              </Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                <De variant="cue" fit style={{ fontSize: 30, lineHeight: 36, flexShrink: 1, textAlign: 'center' }}>
                  {card.answer}
                </De>
                <SpeakButton text={card.answer} tone="plain" />
              </View>
              {gloss ? (
                <Txt variant="small" color="inkSoft">
                  {gloss}
                </Txt>
              ) : null}
              {alsoCounts.length ? (
                <Txt variant="caption" color="inkFaint" center>
                  {t('together.whoamiAlsoCounts', { forms: alsoCounts.join(', ') })}
                </Txt>
              ) : null}
            </Paper>

            <View style={{ gap: space.s }}>
              <Txt variant="small" color="inkSoft" center>
                {outOfQuestions ? t('together.whoamiLastGuess', { name: name(guesser) }) : t('together.whoamiAnswerHint')}
              </Txt>
              <View style={{ flexDirection: 'row', gap: space.s }}>
                {['Ja', 'Nein', 'Jein'].map((a) => (
                  <Button key={a} label={a} kind="secondary" onPress={answer} disabled={outOfQuestions} grow />
                ))}
              </View>
            </View>

            <Paper style={{ gap: space.m }}>
              {card.hints.slice(0, hints).map((h) => (
                <Animated.View key={h} entering={FadeInDown.duration(200)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                  <Lightbulb size={16} color={c.amberInk} />
                  <De variant="germanStrong" style={{ flex: 1 }}>
                    {h}
                  </De>
                  <SpeakButton text={h} tone="plain" />
                </Animated.View>
              ))}
              {hints < card.hints.length ? (
                <Button label={t('together.whoamiHint')} kind="quiet" icon={Lightbulb} size="medium" onPress={hint} />
              ) : (
                <Txt variant="caption" color="inkFaint" center>
                  {t('together.whoamiHintsNone')}
                </Txt>
              )}
              {hints ? (
                <Txt variant="caption" color="inkFaint" center>
                  {t('together.whoamiReadOut')}
                </Txt>
              ) : null}
            </Paper>

            <View style={{ gap: space.s }}>
              <Button label={t('together.guessed')} icon={Check} onPress={() => end(true)} />
              <Button label={t('together.whoamiReveal')} kind="secondary" icon={Drama} onPress={() => end(false)} />
            </View>
          </Animated.View>
        ) : null}

        {phase === 'result' && card ? (
          <Animated.View entering={ZoomIn.duration(300)} style={{ gap: space.l, marginTop: space.xl, alignItems: 'center' }}>
            <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: c.sheet, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: won ? c.green : c.amber }}>
              <Txt variant="title" style={{ fontSize: 36, lineHeight: 42 }}>
                {won ? `+${whoAmIScore(asked, hints)}` : asked}
              </Txt>
            </View>
            <De variant="display" style={{ textAlign: 'center' }}>
              {card.answer}
            </De>
            <Txt variant="body" color="inkSoft" center>
              {won ? t('together.whoamiWon', { name: name(guesser), count: whoAmIScore(asked, hints) }) : t('together.whoamiLost', { name: name(guesser), answer: card.answer })}
            </Txt>
            <View style={{ width: '100%' }}>
              <Button label={round + 1 >= ROUNDS ? t('together.seeResult') : t('together.whoamiSwap', { name: name(guesser) })} onPress={next} />
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}
