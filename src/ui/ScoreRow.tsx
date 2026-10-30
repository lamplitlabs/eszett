// One criterion of the exam grid (src/harness/exam.ts): its label, the score out of four and a bar of four.
// Used by the mock exam and the one-minute talk.

import { View } from 'react-native';

import { MAX_SCORE } from '@/harness/exam';
import { Txt } from '@/ui/Text';
import { space, useTheme } from '@/ui/theme';

export function ScoreRow({ label, score, note }: { label: string; score: number; note?: string }) {
  const { c } = useTheme();
  const tone = score >= 3 ? c.green : score >= 2 ? c.amberInk : c.red;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s }}>
        <Txt variant="small" style={{ flex: 1 }}>
          {label}
        </Txt>
        <Txt variant="smallStrong" style={{ color: tone }}>
          {score}/{MAX_SCORE}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: MAX_SCORE }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < score ? tone : c.rule }} />
        ))}
      </View>
      {note ? (
        <Txt variant="caption" color="inkFaint">
          {note}
        </Txt>
      ) : null}
    </View>
  );
}
