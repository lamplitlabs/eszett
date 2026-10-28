import { router, useLocalSearchParams } from 'expo-router';
import { Check, HelpCircle, Lightbulb, MessageCircle, RotateCcw, X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lessonKey } from '@/features/lesson';
import { buildDrillSet, checkDrill, makeRng, type Drill, type DrillCategory, type DrillResult } from '@/harness/drills';
import { GENUS_ARTICLE } from '@/harness/lexicon';
import { pathDoneKey } from '@/harness/path';
import type { AnswerChecks } from '@/harness/verify';
import { useI18n } from '@/i18n';
import { wordMeaning } from '@/i18n/content';
import { coreLexicon, describeError, isReady, tutor } from '@/model/runtime';
import { nounKey, useDeck } from '@/state/deck';
import { useProgress, type Area } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { CheckFooter } from '@/ui/CheckFooter';
import { ArticleButtons, Choices } from '@/ui/DrillAnswer';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { Button, GenderChip, IconButton, Paper, ProgressBar, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { Markdown } from '@/ui/Markdown';
import { speak } from '@/ui/speech';
import { De, Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

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

interface Outcome {
  drill: Drill;
  given: string;
  ok: boolean;
}

export default function DrillScreen() {
  const { category, lesson, path } = useLocalSearchParams<{ category: DrillCategory; lesson?: string; path?: string }>();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const record = useProgress((s) => s.record);
  const markDone = useProgress((s) => s.markDone);
  const addWord = useDeck((s) => s.add);
  const [seed, setSeed] = useState(() => Date.now());
  const { drills, lemmaByMeaning } = useMemo(() => {
    const lex = tutor.lexicon ?? coreLexicon;
    // the meaning drill carries only English meanings; the lemma behind each one finds its translation
    const byMeaning = new Map<string, string>();
    if (category === 'meaning') for (const n of lex.nouns) if (n.meaning && !byMeaning.has(n.meaning)) byMeaning.set(n.meaning, n.lemma);
    return { drills: buildDrillSet(category, level, lex, makeRng(seed), 8), lemmaByMeaning: byMeaning };
  }, [category, level, seed]);
  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<DrillResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [why, setWhy] = useState<{ status: 'idle' | 'thinking' | 'streaming' | 'done' | 'error'; text: string; checks?: AnswerChecks; error?: string }>({ status: 'idle', text: '' });
  const [saved, setSaved] = useState(false);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));
  const input = useRef<TextInput>(null);
  const area = category as Area;
  const title = t(TITLE_KEYS[category]);
  const finished = index >= drills.length;
  const drill = drills[index];
  const textMode = drill?.mode === 'text';
  const final = result !== null && (result.ok || attempt >= 2 || !textMode);

  /** A lexicon meaning in the app language: the drill's own noun by lemma, any other option by lookup. */
  const meaningLabel = (d: Drill, meaning: string) => {
    const lemma = d.noun?.meaning === meaning ? d.noun.lemma : lemmaByMeaning.get(meaning);
    return lemma ? wordMeaning(lemma, meaning, lang) : meaning;
  };
  const answerLabel = (d: Drill) => (d.category === 'meaning' ? meaningLabel(d, d.answer) : d.answer);
  const sub =
    !drill?.sub || drill.category === 'meaning'
      ? null
      : drill.noun
        ? wordMeaning(drill.noun.lemma, drill.sub, lang)
        : drill.verb
          ? wordMeaning(drill.verb.infinitive, drill.sub, lang)
          : drill.sub;

  const settle = (ok: boolean, answer: string) => {
    record(area, ok);
    setOutcomes((o) => [...o, { drill, given: answer, ok }]);
    if (!ok && drill.noun) {
      // a missed noun goes to My words, so it comes back in review
      const n = drill.noun;
      setSaved(addWord({ key: nounKey(n.lemma), kind: 'noun', german: `${GENUS_ARTICLE[n.genus]} ${n.lemma}`, article: GENUS_ARTICLE[n.genus], lemma: n.lemma, plural: n.plural[0], meaning: n.meaning ?? '', example: n.example, sourceKey: TITLE_KEYS[category] }));
    }
    if (drill.speak) setTimeout(() => speak(drill.speak as string), 250);
  };

  const submit = (answer: string) => {
    if (!drill || final) return;
    const r = checkDrill(drill, answer);
    if (r.digits) {
      setResult(r);
      return;
    }
    const nextAttempt = attempt + 1;
    setAttempt(nextAttempt);
    setResult(r);
    if (r.ok) {
      haptic.success();
      settle(true, answer);
    } else {
      haptic.error();
      shake.set(withSequence(withTiming(-8, { duration: 50 }), withTiming(8, { duration: 50 }), withTiming(-5, { duration: 50 }), withTiming(0, { duration: 50 })));
      if (!textMode || nextAttempt >= 2) settle(false, answer);
      else setShowHint(true);
    }
  };

  const next = () => {
    setIndex((i) => i + 1);
    setGiven('');
    setPicked(null);
    setResult(null);
    setAttempt(0);
    setShowHint(false);
    setWhy({ status: 'idle', text: '' });
    setSaved(false);
    if (index + 1 >= drills.length) {
      if (lesson !== undefined) markDone(lessonKey(Number(lesson)));
      if (path) markDone(pathDoneKey(path));
    }
  };

  const explain = async () => {
    setWhy({ status: 'thinking', text: '' });
    try {
      const r = await tutor.explainDrill(drill, given || picked || '', {
        level,
        lang: explainIn,
        onText: (t) => setWhy({ status: 'streaming', text: t }),
      });
      setWhy({ status: 'done', text: r.text, checks: r.checks });
    } catch (e) {
      setWhy({ status: 'error', text: '', error: describeError(e) });
    }
  };

  if (finished) {
    const right = outcomes.filter((o) => o.ok).length;
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.l }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, gap: space.xl }}>
          <Animated.View entering={ZoomIn.duration(400)} style={{ alignItems: 'center', marginTop: space.x3 }}>
            <View style={{ width: 132, height: 132, borderRadius: 66, borderWidth: 6, borderColor: right >= drills.length * 0.8 ? c.green : c.amber, alignItems: 'center', justifyContent: 'center' }}>
              <Txt variant="title" style={{ fontSize: 40, lineHeight: 46 }}>
                {right}/{drills.length}
              </Txt>
            </View>
            <De variant="display" style={{ marginTop: space.xl }}>
              {right === drills.length ? t('drill.resultExcellent') : right >= drills.length * 0.6 ? t('drill.resultGood') : t('drill.resultKeepGoing')}
            </De>
            <Txt variant="body" color="inkSoft" center style={{ marginTop: space.xs }}>
              {title}
            </Txt>
          </Animated.View>
          <Paper style={{ padding: 0 }}>
            {outcomes.map((o, i) => (
              <View key={o.drill.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m, borderTopWidth: i ? 1 : 0, borderTopColor: c.rule }}>
                {o.ok ? <Check size={18} color={c.green} strokeWidth={2.6} /> : <X size={18} color={c.red} strokeWidth={2.6} />}
                <View style={{ flex: 1 }}>
                  <De variant="german" style={{ fontSize: 17, lineHeight: 23 }}>
                    {answerLabel(o.drill)}
                  </De>
                  {!o.ok && o.given ? (
                    <Txt variant="small" color="inkSoft">
                      {t('drill.youWrote', { given: o.drill.category === 'meaning' ? meaningLabel(o.drill, o.given) : o.given })}
                    </Txt>
                  ) : null}
                </View>
                <SpeakButton text={o.drill.speak ?? o.drill.answer} size={30} tone="plain" />
              </View>
            ))}
          </Paper>
          <View style={{ gap: space.s }}>
            <Button
              label={t('drill.again')}
              icon={RotateCcw}
              onPress={() => {
                setSeed(Date.now());
                setIndex(0);
                setOutcomes([]);
              }}
            />
            <Button label={t('common.done')} kind="secondary" onPress={() => router.back()} />
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
          <ProgressBar value={(index + (final ? 1 : 0)) / drills.length} />
        </View>
        <Txt variant="caption" color="inkSoft" style={{ minWidth: 38, textAlign: 'right' }}>
          {t('drill.progress', { current: index + 1, total: drills.length })}
        </Txt>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
        <Txt variant="smallStrong" color="inkSoft" style={{ marginTop: space.l }}>
          {title}
        </Txt>
        <Animated.View key={drill.id} entering={FadeInDown.duration(260)} style={[{ gap: space.s, minHeight: 150 }, shakeStyle]}>
          <Txt variant="body" color="inkSoft">
            {drill.instruction}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, flexWrap: 'wrap' }}>
            {category === 'article' && final ? <GenderChip article={drill.accept[0]} size="large" /> : null}
            <De variant="cue" style={[drill.cue.length > 28 && { fontSize: 26, lineHeight: 34 }, /\d/.test(drill.cue) && { fontVariant: ['lining-nums'] }]}>
              {drill.cue}
            </De>
          </View>
          {sub ? (
            <Txt variant="body" color="inkSoft">
              {sub}
            </Txt>
          ) : null}
          {drill.category === 'meaning' && drill.sub ? (
            <De variant="german" italic style={{ color: c.inkSoft }}>
              {drill.sub}
            </De>
          ) : null}
        </Animated.View>

        {drill.mode === 'articles' ? (
          <ArticleButtons
            drill={drill}
            picked={picked}
            onPick={(a) => {
              setPicked(a);
              submit(a);
            }}
          />
        ) : null}
        {drill.mode === 'choice' ? (
          <Choices
            drill={drill}
            picked={picked}
            label={(o) => meaningLabel(drill, o)}
            onPick={(a) => {
              setPicked(a);
              submit(a);
            }}
          />
        ) : null}
        {textMode ? (
          <View style={{ gap: space.m }}>
            <TextInput
              ref={input}
              value={given}
              onChangeText={(t) => {
                setGiven(t);
                if (result && !final) setResult(null);
              }}
              editable={!final}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t('drill.answerPlaceholder')}
              placeholderTextColor={c.inkFaint}
              returnKeyType="done"
              onSubmitEditing={() => given.trim() && submit(given)}
              accessibilityLabel={t('drill.answerPlaceholder')}
              style={{
                fontFamily: font.de,
                fontSize: 22,
                color: c.royal,
                backgroundColor: c.sheet,
                borderRadius: radius.control,
                borderWidth: 1.5,
                borderColor: result && !result.ok ? c.red : result?.ok ? c.green : c.rule,
                paddingHorizontal: space.l,
                paddingVertical: 14,
                outlineStyle: 'none',
              } as object}
            />
            {result?.digits ? (
              <Txt variant="small" style={{ color: c.amberInk }}>
                {t('drill.inWords')}
              </Txt>
            ) : null}
            {showHint && !final ? (
              <Animated.View entering={FadeIn.duration(200)}>
                <Paper tone="amber" style={{ flexDirection: 'row', gap: space.s }}>
                  <Lightbulb size={17} color={c.amberInk} style={{ marginTop: 2 }} />
                  <Txt variant="small" style={{ flex: 1 }}>
                    {t('drill.notQuiteHint', { hint: drill.hint })}
                  </Txt>
                </Paper>
              </Animated.View>
            ) : null}
            {!final ? (
              <View style={{ flexDirection: 'row', gap: space.s }}>
                <Button label={t('drill.check')} onPress={() => submit(given)} disabled={!given.trim()} grow />
                {!showHint ? <IconButton icon={HelpCircle} label={t('drill.showHint')} onPress={() => setShowHint(true)} tone="sheet" size={54} /> : null}
              </View>
            ) : null}
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
                  {answerLabel(drill)}
                </De>
                <SpeakButton text={drill.speak ?? drill.answer} />
              </View>
              {result.nearly ? (
                <Txt variant="small" color="inkSoft">
                  {t('drill.watchSpelling', { answer: result.nearly })}
                </Txt>
              ) : null}
              {!result.ok || category === 'article' ? (
                <Txt variant="small" color="inkSoft">
                  {drill.hint}
                </Txt>
              ) : null}
              {saved ? (
                <Txt variant="caption" style={{ color: c.royal }}>
                  {t('drill.savedToWords')}
                </Txt>
              ) : null}
            </Paper>

            {why.status !== 'idle' ? (
              <Paper style={{ gap: space.s }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MessageCircle size={15} color={c.inkSoft} />
                  <Txt variant="caption" color="inkSoft">
                    {drill.noun ? t('drill.tutorExamples') : t('drill.tutorExplains')}
                  </Txt>
                </View>
                {why.status === 'thinking' ? <Thinking /> : null}
                {why.status === 'error' ? (
                  <Txt variant="small" style={{ color: c.red }}>
                    {why.error}
                  </Txt>
                ) : null}
                {why.text ? <Markdown text={why.text} streaming={why.status === 'streaming'} lang={explainIn} onWord={(l) => router.push(`/word/${encodeURIComponent(l)}`)} /> : null}
                {why.status === 'done' && why.checks ? <CheckFooter checks={why.checks} noteTitle={tutor.noteTitle} /> : null}
              </Paper>
            ) : null}

            <View style={{ flexDirection: 'row', gap: space.s }}>
              {why.status === 'idle' && isReady() ? (
                <Button label={drill.noun ? t('drill.examples') : t('drill.why')} icon={MessageCircle} kind="secondary" onPress={() => void explain()} grow />
              ) : null}
              <Button label={index + 1 >= drills.length ? t('drill.seeResults') : t('common.continue')} onPress={next} grow />
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>
    </KeyboardAvoider>
  );
}
