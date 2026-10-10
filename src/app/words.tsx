import { router, useLocalSearchParams } from 'expo-router';
import { BadgeCheck, Bookmark, BookmarkCheck, CircleHelp, Sparkles, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lessonKey, WORD_TOPICS, wordTopicLabel } from '@/features/lesson';
import { notReadyNote, useModelPercent } from '@/features/modelStatus';
import type { CheckedVocabItem } from '@/harness/tutor';
import { useI18n, type Vars } from '@/i18n';
import { wordMeaning } from '@/i18n/content';
import { describeError, tutor, useModel } from '@/model/runtime';
import { topicsFor, useAuthored } from '@/state/authored';
import { nounKey, useDeck } from '@/state/deck';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Button, GenderChip, Paper, Pill, Press, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { gutter, space, useTheme } from '@/ui/theme';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Verdict({ item }: { item: CheckedVocabItem }) {
  const { c } = useTheme();
  const { t } = useI18n();
  if (item.verdict === 'verified')
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <BadgeCheck size={14} color={c.amberInk} />
        <Txt variant="caption" style={{ color: c.amberInk }}>
          {t('words.lexiconAgrees')}
        </Txt>
      </View>
    );
  if (item.verdict === 'fixed')
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <TriangleAlert size={14} color={c.red} />
        <Txt variant="caption" style={{ color: c.red }}>
          {t('words.lexiconCorrected')}
        </Txt>
      </View>
    );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <CircleHelp size={14} color={c.inkFaint} />
      <Txt variant="caption" color="inkFaint">
        {t('words.lexiconUnknown')}
      </Txt>
    </View>
  );
}

/** What the tutor wrote and what the lexicon says instead, for the article, the plural or both. */
function fixedNote(item: CheckedVocabItem, t: (key: string, vars?: Vars) => string): string {
  const wrongArticle = `${item.article} ${item.lemma}`;
  const rightArticle = `${item.lexArticle} ${item.lemma}`;
  if (item.lexArticle && item.lexPlural) return t('words.fixedBoth', { wrongArticle, wrongPlural: item.plural ?? '', rightArticle, rightPlural: item.lexPlural });
  if (item.lexArticle) return t('words.fixedArticle', { wrong: wrongArticle, right: rightArticle });
  return t('words.fixedPlural', { wrong: item.plural ?? '', right: item.lexPlural ?? '' });
}

function WordCard({ item, source }: { item: CheckedVocabItem; source: string }) {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const words = useDeck((s) => s.words);
  const add = useDeck((s) => s.add);
  const article = item.lexArticle ?? item.article;
  const plural = item.lexPlural ?? item.plural;
  const saved = Boolean(words[nounKey(item.lemma)]);
  return (
    <Animated.View entering={FadeInDown.duration(260)}>
      <Paper style={{ gap: space.s }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <GenderChip article={article} size="large" />
          <Press onPress={() => router.push(`/word/${encodeURIComponent(item.lemma)}`)} accessibilityLabel={`${article} ${item.lemma}`} style={{ flex: 1 }}>
            <De variant="germanLarge">{item.lemma}</De>
          </Press>
          <SpeakButton text={`${article ?? ''} ${item.lemma}`} size={32} />
          <Press
            onPress={() => {
              if (saved) return;
              add({ key: nounKey(item.lemma), kind: 'noun', german: `${article} ${item.lemma}`, article: article ?? undefined, lemma: item.lemma, plural: plural ?? undefined, meaning: item.meaning, example: item.example ?? undefined, source });
              haptic.success();
            }}
            accessibilityLabel={saved ? t('words.saved') : t('words.save')}
            hitSlop={8}>
            {saved ? <BookmarkCheck size={20} color={c.royal} /> : <Bookmark size={20} color={c.inkSoft} />}
          </Press>
        </View>
        <Txt variant="body" color="inkSoft">
          {wordMeaning(item.lemma, item.meaning, lang)}
        </Txt>
        {item.verdict === 'fixed' ? (
          <Txt variant="small" style={{ color: c.red }}>
            {fixedNote(item, t)}
          </Txt>
        ) : null}
        <Txt variant="small" color="inkSoft">
          {plural ? (
            <>
              {t('words.plural')} <Txt variant="small" style={{ fontFamily: 'Vollkorn_600SemiBold', color: c.ink, fontSize: 16 }}>die {plural}</Txt>
            </>
          ) : item.noPlural ? (
            t('words.noPlural')
          ) : null}
        </Txt>
        {item.example ? (
          <View>
            <De variant="german" italic speakable>
              {item.example}
            </De>
            {item.exampleGloss ? (
              <Txt variant="small" color="inkSoft">
                {item.exampleGloss}
              </Txt>
            ) : null}
          </View>
        ) : null}
        <Verdict item={item} />
      </Paper>
    </Animated.View>
  );
}

export default function Words() {
  const params = useLocalSearchParams<{ topic?: string; lesson?: string }>();
  const level = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const connection = useModel((s) => s.status);
  const pct = useModelPercent();
  const markDone = useProgress((s) => s.markDone);
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const [topic, setTopic] = useState(params.topic ?? WORD_TOPICS[level][0]);
  const [items, setItems] = useState<CheckedVocabItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const ownTopics = useAuthored((s) => topicsFor(s, level));
  const addTopics = useAuthored((s) => s.addTopics);
  const topics = [...WORD_TOPICS[level], ...ownTopics];
  const [more, setMore] = useState<'idle' | 'running' | 'none' | 'error'>('idle');

  // the model names topics the list does not have yet; they are kept per level on this phone
  const suggest = async () => {
    setMore('running');
    try {
      const fresh = await tutor.suggestTopics({ level, lang: explainIn }, topics);
      if (fresh.length) {
        addTopics(level, fresh);
        setMore('idle');
      } else setMore('none');
    } catch {
      setMore('error');
    }
  };

  // the request itself: state changes only as its answer arrives
  const fetchList = useCallback(
    (name: string) =>
      tutor
        .vocabList(wordTopicLabel(name, explainIn), { level, lang: explainIn, onItems: setItems }, 6)
        .then((r) => {
          setItems(r.items);
          setStatus('done');
          if (params.lesson !== undefined) markDone(lessonKey(Number(params.lesson)));
        })
        .catch((e) => {
          setError(describeError(e));
          setStatus('error');
        }),
    [explainIn, level, markDone, params.lesson],
  );

  // another topic, chosen by the learner
  const run = (name: string) => {
    setTopic(name);
    setItems([]);
    setStatus('running');
    void fetchList(name);
  };

  // the first list starts by itself once the tutor is reachable
  const autoStarted = useRef(false);
  useEffect(() => {
    if (connection !== 'ready' || autoStarted.current) return;
    autoStarted.current = true;
    void fetchList(topic);
  }, [connection, fetchList, topic]);
  const running = status === 'running' || (status === 'idle' && connection === 'ready');

  const verified = items.filter((i) => i.verdict === 'verified').length;

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('words.title')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        <Txt variant="title">{capitalize(wordTopicLabel(topic, lang))}</Txt>
        <Txt variant="body" color="inkSoft">
          {t('words.intro', { level })}
        </Txt>
        {connection !== 'ready' && status === 'idle' ? (
          <Paper tone="alt">
            <Txt variant="small" color="inkSoft">
              {t('words.needsModel', { note: notReadyNote(connection, pct, lang) })}
            </Txt>
          </Paper>
        ) : null}
        <View style={{ gap: space.m, marginTop: space.s }}>
          {items.map((i) => (
            <WordCard key={i.lemma} item={i} source={t('words.source', { topic: wordTopicLabel(topic, lang) })} />
          ))}
        </View>
        {running ? <Thinking label={items.length ? t('words.writingNext') : t('words.choosing')} /> : null}
        {status === 'error' ? (
          <Txt variant="small" style={{ color: c.red }}>
            {error}
          </Txt>
        ) : null}
        {status === 'done' ? (
          <View style={{ gap: space.m, marginTop: space.l }}>
            <Txt variant="small" color="inkSoft">
              {t('words.confirmed', { verified, count: items.length })}
            </Txt>
            <Txt variant="smallStrong">{t('words.anotherTopic')}</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {topics
                .filter((x) => x !== topic)
                .map((x) => (
                  <Pill key={x} label={wordTopicLabel(x, lang)} tone={ownTopics.includes(x) ? 'amber' : 'plain'} onPress={() => run(x)} />
                ))}
            </View>
            {more === 'running' ? (
              <Thinking label={t('words.thinkingTopics')} />
            ) : (
              <Button label={t('words.moreTopics')} icon={Sparkles} kind="secondary" onPress={() => void suggest()} disabled={connection !== 'ready'} />
            )}
            {more === 'none' ? (
              <Txt variant="small" color="inkSoft">
                {t('words.noNewTopics')}
              </Txt>
            ) : null}
            {more === 'error' ? (
              <Txt variant="small" style={{ color: c.red }}>
                {t('words.topicsError')}
              </Txt>
            ) : null}
            <Button label={t('words.reviewMyWords')} kind="secondary" onPress={() => router.push('/review')} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
