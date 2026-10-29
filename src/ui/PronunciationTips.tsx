// The fix-it tips under a speaking result (src/harness/pronunciation.ts): for the words the recognizer did not
// catch, which German sounds to check and how to make them, with the learner's own words as the examples - and
// the reminder that the recognizer mishears too.

import { Text, View } from 'react-native';

import { pronunciationTips } from '@/harness/pronunciation';
import { useI18n } from '@/i18n';
import { Paper } from '@/ui/controls';
import { Txt } from '@/ui/Text';
import { font, space, useTheme } from '@/ui/theme';

export function PronunciationTips({ missed, max = 3 }: { missed: string[]; max?: number }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const tips = pronunciationTips(missed, max);
  if (!tips.length) return null;
  return (
    <Paper tone="alt" style={{ gap: space.s }}>
      <Txt variant="smallStrong">{t('pron.title')}</Txt>
      {tips.map((tip) => (
        <View key={tip.rule} style={{ gap: 2 }}>
          <Text style={{ fontFamily: font.deSemi, fontSize: 16, lineHeight: 22, color: c.ink }}>{tip.words.join(', ')}</Text>
          <Txt variant="small" color="inkSoft">
            {t(`pron.${tip.rule}`)}
          </Txt>
        </View>
      ))}
      <Txt variant="caption" color="inkFaint">
        {t('pron.note')}
      </Txt>
    </Paper>
  );
}
