// The answer controls of a drill, shared by the drill screen and the two-player duel: the three article
// buttons, the multiple-choice list, and a text field for the drills that are typed.

import { forwardRef } from 'react';
import { TextInput, View } from 'react-native';

import type { Drill, DrillResult } from '@/harness/drills';
import { Press } from '@/ui/controls';
import { Txt } from '@/ui/Text';
import { font, genderColor, genderTint, radius, space, useTheme } from '@/ui/theme';

export function ArticleButtons({ drill, picked, onPick }: { drill: Drill; picked: string | null; onPick: (a: string) => void }) {
  const { c } = useTheme();
  const right = drill.accept[0];
  return (
    <View style={{ flexDirection: 'row', gap: space.m }}>
      {(['der', 'die', 'das'] as const).map((a) => {
        const answered = picked !== null;
        const isRight = a === right;
        const isPicked = a === picked;
        const bg = answered && isRight ? genderColor(c, a) : genderTint(c, a);
        const fg = answered && isRight ? '#fff' : genderColor(c, a);
        return (
          <Press
            key={a}
            disabled={answered}
            dimWhenDisabled={false}
            feedback={false}
            onPress={() => onPick(a)}
            accessibilityLabel={a}
            style={{
              flex: 1,
              height: 74,
              borderRadius: radius.sheet,
              backgroundColor: bg,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: answered && isPicked && !isRight ? 2.5 : 0,
              borderColor: c.red,
              opacity: answered && !isRight && !isPicked ? 0.45 : 1,
            }}>
            <Txt style={{ fontFamily: font.deSemi, fontSize: 26, lineHeight: 32, color: fg }}>{a}</Txt>
          </Press>
        );
      })}
    </View>
  );
}

/** Multiple choice. `picked` and `onPick` carry the drill's own option strings; `label` is what the learner reads. */
export function Choices({ drill, picked, label, onPick }: { drill: Drill; picked: string | null; label: (option: string) => string; onPick: (a: string) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.s }}>
      {drill.options?.map((o) => {
        const answered = picked !== null;
        const isRight = drill.accept.includes(o);
        const isPicked = o === picked;
        return (
          <Press
            key={o}
            disabled={answered}
            dimWhenDisabled={false}
            feedback={false}
            onPress={() => onPick(o)}
            accessibilityLabel={label(o)}
            style={{
              minHeight: 54,
              borderRadius: radius.control,
              paddingHorizontal: space.l,
              paddingVertical: space.m,
              justifyContent: 'center',
              backgroundColor: answered && isRight ? c.greenTint : answered && isPicked ? c.redTint : c.sheet,
              borderWidth: 1.5,
              borderColor: answered && isRight ? c.green : answered && isPicked ? c.red : c.rule,
            }}>
            <Txt variant="body" style={{ color: answered && isRight ? c.green : answered && isPicked ? c.red : c.ink }}>
              {label(o)}
            </Txt>
          </Press>
        );
      })}
    </View>
  );
}

/** The typed answer of a text drill, in the German face; the border tells right from wrong once checked. */
export const AnswerField = forwardRef<TextInput, { value: string; onChange: (s: string) => void; onSubmit: () => void; result: DrillResult | null; editable: boolean; placeholder: string }>(
  function AnswerField({ value, onChange, onSubmit, result, editable, placeholder }, ref) {
    const { c } = useTheme();
    return (
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChange}
        editable={editable}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        placeholder={placeholder}
        placeholderTextColor={c.inkFaint}
        returnKeyType="done"
        onSubmitEditing={() => value.trim() && onSubmit()}
        accessibilityLabel={placeholder}
        style={
          {
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
          } as object
        }
      />
    );
  },
);
