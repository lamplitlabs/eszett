import { useLocalSearchParams } from 'expo-router';
import { BadgeCheck, Bookmark, BookmarkCheck, CircleHelp } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-screens/experimental';
import { ScrollView, View } from 'react-native';

import { notReadyNote, useModelPercent } from '@/features/modelStatus';
import { GENUS_ARTICLE } from '@/harness/lexicon';
import type { AnswerChecks } from '@/harness/verify';
import { useI18n } from '@/i18n';
import { wordMeaning } from '@/i18n/content';
import { coreLexicon, describeError, tutor, useModel } from '@/model/runtime';
import { nounKey, useDeck } from '@/state/deck';
import { useSettings } from '@/state/settings';
import { CheckFooter } from '@/ui/CheckFooter';
import { Button, GenderChip, Paper, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { Markdown } from '@/ui/Markdown';
import { De, Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { gutter, space, useTheme } from '@/ui/theme';

/** One noun: what the verified lexicon says about it, and example sentences from the tutor. */
export default function WordSheet() {
  const { lemma: raw } = useLocalSearchParams<{ lemma: string }>();
  const lemma = decodeURIComponent(raw ?? '');
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const level = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const connection = useModel((s) => s.status);
  const pct = useModelPercent();
  const words = useDeck((s) => s.words);
  const add = useDeck((s) => s.add);
  const lex = tutor.lexicon ?? coreLexicon;
  const known = lex.noun(lemma) ?? coreLexicon.noun(lemma);
  const articles = lex.articlesOf(lemma);
  // a compound the lexicon does not list as a whole takes its head's article and plural (Vier-Tage-Woche → die Woche)
  const head = articles.length ? undefined : lex.compoundHead(lemma);
  const plurals = lex.pluralsOfLemma(lemma);
  const article = known ? GENUS_ARTICLE[known.genus] : (articles[0] ?? head?.article ?? null);
  const plural = plurals[0] ?? head?.plural ?? undefined;
  const saved = Boolean(words[nounKey(lemma)]);
  const [state, setState] = useState<{ status: 'idle' | 'streaming' | 'done' | 'error'; text: string; checks?: AnswerChecks; error?: string }>({ status: 'idle', text: '' });
  const started = useRef(false);

  // ask the tutor once, as soon as it is reachable; state changes only when the answer streams in
  useEffect(() => {
    if (connection !== 'ready' || started.current) return;
    started.current = true;
    tutor
      .wordExamples(article ? `${article} ${lemma}` : lemma, { level, lang: explainIn, onText: (t) => setState({ status: 'streaming', text: t }) })
      .then((r) => setState({ status: 'done', text: r.text, checks: r.checks }))
      .catch((e) => setState({ status: 'error', text: '', error: describeError(e) }));
  }, [article, connection, explainIn, lemma, level]);
  const thinking = state.status === 'idle' && connection === 'ready';

  return (
    <SafeAreaView edges={{ top: true }} style={{ flex: 1, backgroundColor: c.sheet }}>
    <ScrollView style={{ flex: 1, backgroundColor: c.sheet }} contentContainerStyle={{ padding: gutter, paddingTop: space.x3, gap: space.l }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <GenderChip article={article} size="large" />
        <De variant="cue" fit style={{ flex: 1, fontSize: 34, lineHeight: 40 }}>
          {lemma}
        </De>
        <SpeakButton text={article ? `${article} ${lemma}` : lemma} />
      </View>
      {articles.length || plurals.length ? (
        <Paper tone="amber" style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <BadgeCheck size={15} color={c.amberInk} />
            <Txt variant="caption" style={{ color: c.amberInk }}>
              {t('word.verifiedLexicon')}
            </Txt>
          </View>
          {articles.length ? (
            <Txt variant="body">
              {t('word.article')} <De variant="germanStrong">{articles.join(t('word.or'))}</De>
            </Txt>
          ) : null}
          <Txt variant="body">
            {t('word.plural')} <De variant="germanStrong">{plurals.length ? `die ${plurals.join(' / die ')}` : t('word.noPlural')}</De>
          </Txt>
          {known?.meaning ? <Txt variant="body">{t('word.meaning', { meaning: wordMeaning(lemma, known.meaning, lang) })}</Txt> : null}
        </Paper>
      ) : head ? (
        <Paper tone="amber" style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <BadgeCheck size={15} color={c.amberInk} />
            <Txt variant="caption" style={{ color: c.amberInk }}>
              {t('word.verifiedHead')}
            </Txt>
          </View>
          <Txt variant="body">{t('word.compoundHead', { head: `${head.article} ${head.head}` })}</Txt>
          <Txt variant="body">
            {t('word.article')} <De variant="germanStrong">{head.article}</De>
          </Txt>
          {head.plural ? (
            <Txt variant="body">
              {t('word.plural')} <De variant="germanStrong">{`die ${head.plural}`}</De>
            </Txt>
          ) : null}
        </Paper>
      ) : (
        <Paper tone="alt" style={{ flexDirection: 'row', gap: space.s }}>
          <CircleHelp size={16} color={c.inkSoft} style={{ marginTop: 2 }} />
          <Txt variant="small" color="inkSoft" style={{ flex: 1 }}>
            {t('word.notInLexicon')}
          </Txt>
        </Paper>
      )}
      <View style={{ gap: space.s }}>
        <Txt variant="headline">{t('word.fromTutor')}</Txt>
        {connection !== 'ready' && state.status === 'idle' ? (
          <Txt variant="small" color="inkSoft">
            {notReadyNote(connection, pct, lang)}
          </Txt>
        ) : null}
        {thinking ? <Thinking /> : null}
        {state.status === 'error' ? (
          <Txt variant="small" style={{ color: c.red }}>
            {state.error}
          </Txt>
        ) : null}
        {state.text ? <Markdown text={state.text} streaming={state.status === 'streaming'} lang={explainIn} /> : null}
        {state.status === 'done' && state.checks ? <CheckFooter checks={state.checks} noteTitle={tutor.noteTitle} /> : null}
      </View>
      {article ? (
        <Button
          label={saved ? t('word.inMyWords') : t('word.saveToMyWords')}
          icon={saved ? BookmarkCheck : Bookmark}
          kind="secondary"
          disabled={saved}
          onPress={() => {
            add({ key: nounKey(lemma), kind: 'noun', german: `${article} ${lemma}`, article, lemma, plural, meaning: known?.meaning ?? '', example: known?.example, sourceKey: 'word.source' });
            haptic.success();
          }}
        />
      ) : null}
    </ScrollView>
    </SafeAreaView>
  );
}
