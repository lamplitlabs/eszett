import { router } from 'expo-router';
import { Check, RotateCcw, Share2, Trash2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { wordMeaning } from '@/i18n/content';
import { formatDeckWordsCsv } from '@/features/reviewRules';
import { shareWordsCsv } from '@/features/reviewCsv';
import { confirmRemoveWord, dueWords, sourceLabel, useDeck, type DeckWord } from '@/state/deck';
import { useProgress } from '@/state/progress';
import { Button, GenderChip, IconButton, Paper, ProgressBar, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { speak } from '@/ui/speech';
import { De, Txt } from '@/ui/Text';
import { gutter, space, useTheme } from '@/ui/theme';

function AllWords() {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const words = useDeck((s) => s.words);
  const remove = useDeck((s) => s.remove);
  const list = Object.values(words).sort((a, b) => b.added - a.added);
  if (!list.length) return null;
  return (
    <Paper style={{ padding: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: space.s, paddingTop: space.s }}>
        <IconButton
          icon={Share2}
          label={t('review.share')}
          size={36}
          onPress={() =>
            shareWordsCsv(
              formatDeckWordsCsv(list.map((w) => ({ german: w.german, meaning: wordMeaning(w.lemma ?? w.german, w.meaning, lang), box: w.box }))),
              {
                title: t('review.shareFailedTitle'),
                message: t('review.shareFailedMessage'),
                retry: t('common.retry'),
                cancel: t('common.cancel'),
              },
            )
          }
        />
      </View>
      {list.map((w, i) => (
        <View key={w.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m, borderTopWidth: i ? 1 : 0, borderTopColor: c.rule }}>
          <View style={{ flex: 1 }}>
            <De variant="germanStrong" style={{ fontSize: 17, lineHeight: 23 }}>
              {w.german}
            </De>
            <Txt variant="small" color="inkSoft" numberOfLines={1}>
              {wordMeaning(w.lemma ?? w.german, w.meaning, lang)}
            </Txt>
          </View>
          <Txt variant="caption" color="inkFaint">
            {t('review.box', { box: w.box })}
          </Txt>
          <IconButton
            icon={Trash2}
            label={t('review.remove', { word: w.german })}
            size={32}
            onPress={() =>
              confirmRemoveWord(
                {
                  title: t('review.removeTitle'),
                  message: t('review.removeMessage', { word: w.german }),
                  confirm: t('review.removeConfirm'),
                  cancel: t('common.cancel'),
                },
                remove,
                w.key,
              )
            }
          />
        </View>
      ))}
    </Paper>
  );
}

export default function Review() {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const words = useDeck((s) => s.words);
  const grade = useDeck((s) => s.grade);
  const record = useProgress((s) => s.record);
  const queue = useMemo<DeckWord[]>(() => dueWords(words).slice(0, 20), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [right, setRight] = useState(0);
  const w = queue[i];
  const source = w ? sourceLabel(w, t) : '';

  const answer = (remembered: boolean) => {
    if (!w) return;
    grade(w.key, remembered);
    record('review', remembered);
    if (remembered) {
      setRight((r) => r + 1);
      haptic.success();
    } else haptic.error();
    setShown(false);
    setI((x) => x + 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top + space.xs }}>
      <View style={{ paddingHorizontal: space.m, flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <IconButton icon={X} label={t('common.close')} onPress={() => router.back()} tone="sheet" size={38} />
        <View style={{ flex: 1 }}>{queue.length ? <ProgressBar value={i / queue.length} /> : null}</View>
        <Txt variant="caption" color="inkSoft" style={{ minWidth: 38, textAlign: 'right' }}>
          {queue.length ? t('review.progress', { current: Math.min(i + 1, queue.length), total: queue.length }) : ''}
        </Txt>
      </View>
      <ScrollView contentContainerStyle={{ padding: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl, flexGrow: 1 }}>
        {w ? (
          <Animated.View key={w.key} entering={FadeInDown.duration(240)} style={{ flex: 1, gap: space.xl }}>
            <Txt variant="smallStrong" color="inkSoft" style={{ marginTop: space.l }}>
              {t('review.question')}
            </Txt>
            <View style={{ gap: space.m, minHeight: 160, justifyContent: 'center' }}>
              {w.article ? <GenderChip article={w.article} size="large" /> : null}
              <De variant="cue" speakable={w.german}>
                {w.lemma ?? w.german}
              </De>
              {source ? (
                <Txt variant="caption" color="inkFaint">
                  {t('review.from', { source })}
                </Txt>
              ) : null}
            </View>
            {shown ? (
              <Animated.View entering={FadeIn.duration(200)} style={{ gap: space.l }}>
                <Paper style={{ gap: space.s }}>
                  {w.meaning ? (
                    <Txt variant="headline">{wordMeaning(w.lemma ?? w.german, w.meaning, lang)}</Txt>
                  ) : (
                    <Button label={t('review.openWordSheet')} kind="quiet" size="small" onPress={() => router.push(`/word/${encodeURIComponent(w.lemma ?? w.german)}`)} />
                  )}
                  {w.plural ? (
                    <Txt variant="small" color="inkSoft">
                      {t('review.plural')} <Txt variant="small" style={{ fontFamily: 'Vollkorn_600SemiBold', color: c.ink, fontSize: 16 }}>die {w.plural}</Txt>
                    </Txt>
                  ) : null}
                  {w.example ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                      <De variant="german" italic speakable style={{ flex: 1 }}>
                        {w.example}
                      </De>
                      <SpeakButton text={w.example} size={30} />
                    </View>
                  ) : null}
                </Paper>
                <View style={{ flexDirection: 'row', gap: space.s }}>
                  <Button label={t('review.again')} icon={RotateCcw} kind="pen" grow onPress={() => answer(false)} />
                  <Button label={t('review.knewIt')} icon={Check} grow onPress={() => answer(true)} />
                </View>
              </Animated.View>
            ) : (
              <Button
                label={t('review.showMeaning')}
                onPress={() => {
                  setShown(true);
                  speak(w.german);
                }}
              />
            )}
          </Animated.View>
        ) : (
          <View style={{ gap: space.xl }}>
            <View style={{ alignItems: 'center', marginTop: space.x3, gap: space.s }}>
              <De variant="display">{queue.length ? t('review.finished') : t('review.allDone')}</De>
              <Txt variant="body" color="inkSoft" center>
                {queue.length ? t('review.summary', { count: right, total: queue.length }) : t('review.nothingDue')}
              </Txt>
            </View>
            <AllWords />
            <Button label={t('common.done')} kind="secondary" onPress={() => router.back()} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
