// A grammar card the tutor model writes for any topic the learner names. The app's rule notes go into the
// prompt when one matches; the lexicon checks every example before the card is kept on this phone.

import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthorBox } from '@/features/AuthorBox';
import { useI18n } from '@/i18n';
import { tutor } from '@/model/runtime';
import { useAuthored } from '@/state/authored';
import { useSettings } from '@/state/settings';
import { TopBar } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { gutter, space, useTheme } from '@/ui/theme';

export default function NewGrammarCard() {
  const { topic } = useLocalSearchParams<{ topic?: string }>();
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const addCard = useAuthored((s) => s.addCard);

  const write = async (wish: string) => {
    const draft = await tutor.designGrammarCard(wish, { level, lang: explainIn });
    addCard({ ...draft.card, generated: true, created: Date.now(), topic: wish, dropped: draft.dropped, grounded: draft.grounded });
    router.replace(`/grammar/${draft.card.key}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('grammar.newTitle')} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.l }}>
        <Txt variant="body" color="inkSoft">
          {t('grammar.newIntro', { level })}
        </Txt>
        <AuthorBox
          title={t('grammar.newWhich')}
          hint={t('grammar.newHint')}
          placeholder={t('grammar.newPlaceholder')}
          buttonLabel={t('grammar.newWrite')}
          busyLabel={t('grammar.newWriting')}
          unusableKey="grammar.draftUnusable"
          initial={topic ?? ''}
          autoFocus={!topic}
          onSubmit={write}
        />
      </ScrollView>
    </View>
  );
}
