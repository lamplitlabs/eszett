import { router, useLocalSearchParams } from 'expo-router';
import { BookOpenText, ChevronRight, Grid3x3, MessagesSquare, Swords, WholeWord } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthorBox } from '@/features/AuthorBox';
import { PlayerNames } from '@/features/PlayerNames';
import { playerName, topicLabel, useTogether } from '@/features/together';
import { LEVELS, type Level } from '@/harness/levels';
import { TALK_TOPICS } from '@/harness/together';
import { DraftError } from '@/harness/tutor';
import { over as wordleOver } from '@/harness/wordle';
import { useI18n } from '@/i18n';
import { tutor } from '@/model/runtime';
import { useSettings } from '@/state/settings';
import { Paper, Pill, Press } from '@/ui/controls';
import { TopBar } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { gutter, radius, space, useTheme, type Palette } from '@/ui/theme';

function GameRow({ title, detail, icon: Icon, tone, tint, onPress, first }: { title: string; detail: string; icon: typeof Swords; tone: keyof Palette; tint: keyof Palette; onPress: () => void; first?: boolean }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} scaleTo={0.99} accessibilityLabel={title}>
      <View style={{ flexDirection: 'row', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.l, borderTopWidth: first ? 0 : 1, borderTopColor: c.rule, alignItems: 'center' }}>
        <View style={{ width: 46, height: 46, borderRadius: radius.control, backgroundColor: c[tint], alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={22} color={c[tone]} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong">{title}</Txt>
          <Txt variant="small" color="inkSoft">
            {detail}
          </Txt>
        </View>
        <ChevronRight size={18} color={c.inkFaint} />
      </View>
    </Press>
  );
}

export default function TogetherHub() {
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ level?: Level }>();
  const learnerLevel = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const [level, setLevel] = useState<Level>(params.level && LEVELS.includes(params.level) ? params.level : learnerLevel);
  const setCustom = useTogether((s) => s.setCustom);
  const played = useTogether((s) => s.played);
  const names = useTogether((s) => s.names);
  const scrabble = useTogether((s) => s.scrabble);
  const wordle = useTogether((s) => s.wordle);
  const name = (p: 0 | 1) => playerName(names, p, (n) => t('together.playerN', { n }));
  const sessions = Object.values(played).reduce((a, b) => a + (b ?? 0), 0);

  // the model writes questions for a topic of the players' own; the bundled topics open straight away
  const write = async (topic: string) => {
    const points = await tutor.talkPoints(topic, { level, lang: explainIn });
    if (points.length < 3) throw new DraftError(t('together.ownReason'), '');
    setCustom({ title: topic, points });
    router.push({ pathname: '/together/talk', params: { topic: 'custom', level } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('together.title')} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
        <Txt variant="body" color="inkSoft">
          {t('together.intro')}
        </Txt>

        <PlayerNames />

        <View style={{ gap: space.s }}>
          <Txt variant="smallStrong" color="inkSoft">
            {t('together.levelLabel')}
          </Txt>
          <View style={{ flexDirection: 'row', gap: space.s }} accessibilityRole="tablist">
            {LEVELS.map((l) => (
              <Pill key={l} label={l} selected={l === level} onPress={() => setLevel(l)} />
            ))}
          </View>
        </View>

        <View style={{ gap: space.m }}>
          <Txt variant="headline" accessibilityRole="header">
            {t('together.talkTitle')}
          </Txt>
          <Txt variant="small" color="inkSoft">
            {t('together.talkDetail')}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {TALK_TOPICS.map((topic) => (
              <Pill key={topic} label={topicLabel(topic, t)} onPress={() => router.push({ pathname: '/together/talk', params: { topic, level } })} />
            ))}
          </View>
          <AuthorBox
            title={t('together.ownTitle')}
            hint={t('together.ownHint', { level })}
            placeholder={t('together.ownPlaceholder')}
            buttonLabel={t('together.ownWrite')}
            busyLabel={t('together.ownWriting')}
            unusableKey="together.ownUnusable"
            onSubmit={write}
          />
        </View>

        <View style={{ gap: space.m }}>
          <Txt variant="headline" accessibilityRole="header">
            {t('together.gamesTitle')}
          </Txt>
          <Paper style={{ padding: 0, overflow: 'hidden' }}>
            <GameRow first title={t('together.duelTitle')} detail={t('together.duelDetail')} icon={Swords} tone="die" tint="dieTint" onPress={() => router.push({ pathname: '/together/duel', params: { level } })} />
            <GameRow title={t('together.tabooTitle')} detail={t('together.tabooDetail')} icon={MessagesSquare} tone="der" tint="derTint" onPress={() => router.push({ pathname: '/together/taboo', params: { level } })} />
            <GameRow title={t('together.storyTitle')} detail={t('together.storyDetail')} icon={BookOpenText} tone="das" tint="dasTint" onPress={() => router.push({ pathname: '/together/story', params: { level } })} />
            <GameRow
              title={t('together.scrabbleTitle')}
              detail={scrabble && !scrabble.over ? t('together.resume', { a: name(0), sa: scrabble.scores[0], b: name(1), sb: scrabble.scores[1] }) : t('together.scrabbleDetail')}
              icon={Grid3x3}
              tone="amberInk"
              tint="amberTint"
              onPress={() => router.push('/together/scrabble')}
            />
            <GameRow
              title={t('together.wordleTitle')}
              detail={wordle && !wordleOver(wordle) ? t('together.resume', { a: name(0), sa: wordle.scores[0], b: name(1), sb: wordle.scores[1] }) : t('together.wordleDetail')}
              icon={WholeWord}
              tone="royal"
              tint="royalTint"
              onPress={() => router.push({ pathname: '/together/wordle', params: { level } })}
            />
          </Paper>
          {sessions ? (
            <Txt variant="caption" color="inkFaint">
              {t('together.played', { count: sessions })}
            </Txt>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
