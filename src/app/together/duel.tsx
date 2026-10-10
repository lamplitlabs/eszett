import { router, useLocalSearchParams } from 'expo-router';
import { Check, ChevronRight, RotateCcw, Trophy, X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerNames } from '@/features/PlayerNames';
import { playerName, useTogether } from '@/features/together';
import { checkDrill, makeRng, type Drill, type DrillCategory, type DrillResult } from '@/harness/drills';
import { LEVELS, type Level } from '@/harness/levels';
import { DUEL_CATEGORIES, duelAnswered, duelDone, duelPlayer, duelScores, duelWinner, newDuel, type DuelState } from '@/harness/together';
import { useI18n } from '@/i18n';
import { wordMeaning } from '@/i18n/content';
import { coreLexicon, tutor } from '@/model/runtime';
import { useSettings } from '@/state/settings';
import { Button, GenderChip, IconButton, Paper, Pill, ProgressBar, SpeakButton } from '@/ui/controls';
import { AnswerField, ArticleButtons, Choices } from '@/ui/DrillAnswer';
import { haptic } from '@/ui/haptics';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { speak } from '@/ui/speech';
import { De, Txt } from '@/ui/Text';
import { TopBar } from '@/ui/Screen';
import { gutter, space, useTheme } from '@/ui/theme';

const TITLE_KEYS: Record<DrillCategory, string> = {
  article: 'drill.titleArticle',
  plural: 'drill.titlePlural',
  meaning: 'drill.titleMeaning',
  verbs: 'drill.titleVerbs',
  numbers: 'drill.titleNumbers',
  clock: 'drill.titleClock',
  dates: 'drill.titleDates',
  prices: 'drill.titlePrices',
  ordinals: 'drill.titleOrdinals',
  sentence: 'drill.titleSentence',
};

const ROUNDS = [3, 5, 8];

export default function DuelScreen() {
  const params = useLocalSearchParams<{ level?: Level }>();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const learnerLevel = useSettings((s) => s.level);
  const level: Level = params.level && LEVELS.includes(params.level) ? params.level : learnerLevel;
  const names = useTogether((s) => s.names);
  const finished = useTogether((s) => s.finished);
  const name = (p: 0 | 1) => playerName(names, p, (n) => t('together.playerN', { n }));

  const [category, setCategory] = useState<DrillCategory>('article');
  const [rounds, setRounds] = useState(5);
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [given, setGiven] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<DrillResult | null>(null);
  const input = useRef<TextInput>(null);
  const lex = tutor.lexicon ?? coreLexicon;
  // the meaning drill carries only English meanings; the lemma behind each one finds its translation
  const lemmaByMeaning = useMemo(() => {
    const m = new Map<string, string>();
    if (category === 'meaning') for (const n of lex.nouns) if (n.meaning && !m.has(n.meaning)) m.set(n.meaning, n.lemma);
    return m;
  }, [category, lex]);
  const meaningLabel = (d: Drill, meaning: string) => {
    const lemma = d.noun?.meaning === meaning ? d.noun.lemma : lemmaByMeaning.get(meaning);
    return lemma ? wordMeaning(lemma, meaning, lang) : meaning;
  };
  const answerLabel = (d: Drill) => (d.category === 'meaning' ? meaningLabel(d, d.answer) : d.answer);

  const start = () => {
    haptic.tap();
    setDuel(newDuel(category, level, lex, makeRng(Date.now()), rounds));
    setGiven('');
    setPicked(null);
    setResult(null);
  };

  if (!duel) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        <TopBar title={t('together.duelTitle')} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
          <Txt variant="body" color="inkSoft">
            {t('together.duelIntro', { a: name(0), b: name(1), level })}
          </Txt>
          <PlayerNames />
          <View style={{ gap: space.s }}>
            <Txt variant="smallStrong" color="inkSoft">
              {t('together.duelWhat')}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {DUEL_CATEGORIES.map((cat) => (
                <Pill key={cat} label={t(TITLE_KEYS[cat])} selected={cat === category} onPress={() => setCategory(cat)} />
              ))}
            </View>
          </View>
          <View style={{ gap: space.s }}>
            <Txt variant="smallStrong" color="inkSoft">
              {t('together.duelRounds')}
            </Txt>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              {ROUNDS.map((n) => (
                <Pill key={n} label={t('together.roundsEach', { count: n })} selected={n === rounds} onPress={() => setRounds(n)} />
              ))}
            </View>
          </View>
          <Button label={t('together.start')} onPress={start} />
        </ScrollView>
      </View>
    );
  }

  const index = duel.results.length;
  // undefined once the last drill is answered: the screen then shows that answer until "see the result"
  const drill: Drill | undefined = duel.drills[index];
  const player = duelPlayer(index);
  const scores = duelScores(duel);
  // one attempt each, so both players play by the same rule; typed digits only ask for the number in words
  const final = result !== null && !result.digits;
  const title = t(TITLE_KEYS[duel.category]);

  // takes the drill as an argument so no closure reads `drill.speak` while `drill` may be undefined
  const settle = (answered: Drill, ok: boolean) => {
    if (answered.speak) setTimeout(() => speak(answered.speak as string), 250);
    setDuel((d) => (d ? duelAnswered(d, ok) : d));
  };

  const submit = (answer: string) => {
    if (!drill || final) return;
    const r = checkDrill(drill, answer);
    if (r.digits) {
      setResult(r);
      return;
    }
    setResult(r);
    if (r.ok) haptic.success();
    else haptic.error();
    settle(drill, r.ok);
  };

  const next = () => {
    setGiven('');
    setPicked(null);
    setResult(null);
  };

  // the state advances when an answer settles; the screen keeps showing the answered drill until "pass the phone"
  const shownIndex = final ? index - 1 : index;
  const shownDrill = duel.drills[shownIndex] ?? drill;
  const shownPlayer = duelPlayer(shownIndex);

  if (duelDone(duel) && !final) {
    const winner = duelWinner(duel);
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.l }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, gap: space.xl }}>
          <Animated.View entering={ZoomIn.duration(400)} style={{ alignItems: 'center', marginTop: space.x3, gap: space.m }}>
            <Trophy size={48} color={c.amberInk} />
            <De variant="display">{winner === null ? t('together.draw') : t('together.wins', { name: name(winner) })}</De>
            <Txt variant="body" color="inkSoft" center>
              {t('together.score', { a: name(0), sa: scores[0], b: name(1), sb: scores[1], total: rounds })}
            </Txt>
          </Animated.View>
          <Paper style={{ padding: 0 }}>
            {duel.drills.map((d, i) => (
              <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m, borderTopWidth: i ? 1 : 0, borderTopColor: c.rule }}>
                {duel.results[i] ? <Check size={18} color={c.green} strokeWidth={2.6} /> : <X size={18} color={c.red} strokeWidth={2.6} />}
                <View style={{ flex: 1 }}>
                  <De variant="german" style={{ fontSize: 17, lineHeight: 23 }}>
                    {answerLabel(d)}
                  </De>
                  <Txt variant="caption" color="inkFaint">
                    {name(duelPlayer(i))}
                  </Txt>
                </View>
                <SpeakButton text={d.speak ?? d.answer} size={30} tone="plain" />
              </View>
            ))}
          </Paper>
          <View style={{ gap: space.s }}>
            <Button
              label={t('together.again')}
              icon={RotateCcw}
              onPress={() => {
                finished('duel');
                start();
              }}
            />
            <Button
              label={t('common.done')}
              kind="secondary"
              onPress={() => {
                finished('duel');
                router.back();
              }}
            />
          </View>
        </ScrollView>
      </View>
    );
  }
  // every other state has a drill to show: the current one, or the one just answered
  if (!shownDrill) return null;

  return (
    <KeyboardAvoider style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ paddingTop: insets.top + space.xs, paddingHorizontal: space.m, flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <IconButton icon={X} label={t('common.close')} onPress={() => router.back()} tone="sheet" size={38} />
        <View style={{ flex: 1 }}>
          <ProgressBar value={duel.results.length / duel.drills.length} />
        </View>
        <Txt variant="caption" color="inkSoft" style={{ minWidth: 38, textAlign: 'right' }}>
          {t('drill.progress', { current: Math.min(shownIndex + 1, duel.drills.length), total: duel.drills.length })}
        </Txt>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.l }}>
          <Txt variant="smallStrong" color="inkSoft">
            {title}
          </Txt>
          <Txt variant="smallStrong" color="inkSoft" style={{ fontVariant: ['tabular-nums'] }}>
            {name(0)} {scores[0]} · {scores[1]} {name(1)}
          </Txt>
        </View>

        <Paper tone={shownPlayer === 0 ? 'royal' : 'amber'}>
          <Txt variant="bodyStrong">{t('together.turnOf', { name: name(shownPlayer) })}</Txt>
        </Paper>

        <Animated.View key={shownDrill.id} entering={FadeInDown.duration(260)} style={{ gap: space.s, minHeight: 120 }}>
          <Txt variant="body" color="inkSoft">
            {shownDrill.instruction}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, flexWrap: 'wrap' }}>
            {shownDrill.category === 'article' && final ? <GenderChip article={shownDrill.accept[0]} size="large" /> : null}
            <De variant="cue" style={[shownDrill.cue.length > 28 && { fontSize: 26, lineHeight: 34 }, /\d/.test(shownDrill.cue) && { fontVariant: ['lining-nums'] }]}>
              {shownDrill.cue}
            </De>
          </View>
          {shownDrill.sub && shownDrill.category !== 'meaning' ? (
            <Txt variant="body" color="inkSoft">
              {shownDrill.noun ? wordMeaning(shownDrill.noun.lemma, shownDrill.sub, lang) : shownDrill.verb ? wordMeaning(shownDrill.verb.infinitive, shownDrill.sub, lang) : shownDrill.sub}
            </Txt>
          ) : null}
          {shownDrill.category === 'meaning' && shownDrill.sub ? (
            <De variant="german" italic style={{ color: c.inkSoft }}>
              {shownDrill.sub}
            </De>
          ) : null}
        </Animated.View>

        {shownDrill.mode === 'articles' ? (
          <ArticleButtons
            drill={shownDrill}
            picked={picked}
            onPick={(a) => {
              setPicked(a);
              submit(a);
            }}
          />
        ) : null}
        {shownDrill.mode === 'choice' ? (
          <Choices
            drill={shownDrill}
            picked={picked}
            label={(o) => meaningLabel(shownDrill, o)}
            onPick={(a) => {
              setPicked(a);
              submit(a);
            }}
          />
        ) : null}
        {shownDrill.mode === 'text' ? (
          <View style={{ gap: space.m }}>
            <AnswerField
              ref={input}
              value={given}
              onChange={(s) => {
                setGiven(s);
                if (result && !final) setResult(null);
              }}
              onSubmit={() => submit(given)}
              result={result}
              editable={!final}
              placeholder={t('drill.answerPlaceholder')}
            />
            {result?.digits ? (
              <Txt variant="small" style={{ color: c.amberInk }}>
                {t('drill.inWords')}
              </Txt>
            ) : null}
            {!final ? <Button label={t('drill.check')} onPress={() => submit(given)} disabled={!given.trim()} /> : null}
          </View>
        ) : null}

        {final && result ? (
          <Animated.View entering={FadeInDown.duration(240)} style={{ gap: space.m }}>
            <Paper tone={result.ok ? 'green' : 'red'} style={{ gap: space.s }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                {result.ok ? <Check size={20} color={c.green} strokeWidth={2.8} /> : <X size={20} color={c.red} strokeWidth={2.8} />}
                <Txt variant="headline" style={{ color: result.ok ? c.green : c.red, fontFamily: 'Vollkorn_600SemiBold' }}>
                  {result.ok ? (result.nearly ? t('drill.nearlyRight') : t('drill.right')) : t('drill.notQuite')}
                </Txt>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                <De variant="germanLarge" style={{ flex: 1 }}>
                  {answerLabel(shownDrill)}
                </De>
                <SpeakButton text={shownDrill.speak ?? shownDrill.answer} />
              </View>
              {!result.ok || shownDrill.category === 'article' ? (
                <Txt variant="small" color="inkSoft">
                  {shownDrill.hint}
                </Txt>
              ) : null}
            </Paper>
            <Button label={duelDone(duel) ? t('together.seeResult') : t('together.passPhone', { name: name(player) })} icon={ChevronRight} onPress={next} />
          </Animated.View>
        ) : null}
      </ScrollView>
    </KeyboardAvoider>
  );
}
