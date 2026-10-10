// The correction, the way a German teacher marks an exercise book: the learner's sentence on ruled paper
// in royal-blue ink, what the tutor removed struck through, what it added written in red pen. A sentence
// that was already right gets the teacher's red tick.

import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import type { DiffOp } from '@/harness/diff';
import { useI18n } from '@/i18n';

import { SpeakButton } from './controls';
import { Txt } from './Text';
import { font, radius, space, useTheme } from './theme';

const LINE = 34;

/** Ruled exercise-book paper with the red margin line. */
export function Heft({ children, minLines = 2 }: { children: React.ReactNode; minLines?: number }) {
  const { c, scheme } = useTheme();
  const [height, setHeight] = useState(LINE * minLines);
  const lines = Math.max(minLines, Math.ceil(height / LINE));
  const ruleColor = scheme === 'dark' ? 'rgba(129,151,255,0.16)' : 'rgba(42,115,224,0.16)';
  return (
    <View style={{ backgroundColor: c.sheet, borderRadius: radius.control, borderWidth: 1, borderColor: c.rule, overflow: 'hidden' }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 10 }}>
        {Array.from({ length: lines + 1 }, (_, i) => (
          <View key={i} style={{ height: LINE, borderBottomWidth: 1, borderBottomColor: ruleColor }} />
        ))}
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 30, width: 1.5, backgroundColor: c.red, opacity: 0.55 }} />
      <View onLayout={(e) => setHeight(e.nativeEvent.layout.height)} style={{ paddingLeft: 42, paddingRight: space.l, paddingVertical: 12 }}>
        {children}
      </View>
    </View>
  );
}

const needsSpace = (prev: string, next: string) => !/^[.,;:!?)\]}“”"»]/.test(next) && !/[(\[{„«]$/.test(prev);

export function RedPen({ original, corrected, diff, unchanged }: { original: string; corrected: string | null; diff: DiffOp[] | null; unchanged: boolean }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const ink = { fontFamily: font.deItalic, fontSize: 21, lineHeight: LINE, color: c.royal };
  if (unchanged || !corrected || !diff) {
    return (
      <Heft>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s }}>
          <Text style={[ink, { flex: 1 }]}>{original}</Text>
          {unchanged ? (
            <Animated.View entering={reduced ? undefined : FadeIn.duration(400)} accessibilityLabel={t('ui.correctLabel')}>
              <Check size={30} color={c.red} strokeWidth={2.6} />
            </Animated.View>
          ) : null}
        </View>
      </Heft>
    );
  }
  const parts: React.ReactNode[] = [];
  let prev = '';
  diff.forEach((op, i) => {
    const gap = prev && needsSpace(prev, op.text) ? ' ' : '';
    prev = op.text;
    if (op.type === 'same') parts.push(<Text key={i}>{gap + op.text}</Text>);
    else if (op.type === 'del')
      parts.push(
        <Text key={i}>
          {gap}
          <Text style={{ textDecorationLine: 'line-through', textDecorationColor: c.red, textDecorationStyle: 'solid', color: c.inkFaint }}>{op.text}</Text>
        </Text>,
      );
    else
      parts.push(
        <Text key={i}>
          {gap}
          <Text style={{ color: c.red, fontFamily: font.deSemiItalic }}>{op.text}</Text>
        </Text>,
      );
  });
  return (
    <View style={{ gap: space.m }}>
      <Heft>
        <Text style={ink} accessibilityLabel={t('ui.redPenLabel', { original, corrected })}>
          {parts}
        </Text>
      </Heft>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <View style={{ flex: 1 }}>
          <Txt variant="caption" color="inkSoft">
            {t('ui.corrected')}
          </Txt>
          <Text style={{ fontFamily: font.deSemi, fontSize: 19, lineHeight: 27, color: c.ink }} selectable>
            {corrected}
          </Text>
        </View>
        <SpeakButton text={corrected} />
      </View>
    </View>
  );
}
