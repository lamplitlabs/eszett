import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { useI18n } from '@/i18n';

import { onSpeaking, speak } from './speech';
import { type as typeScale, useTheme, type Palette } from './theme';

type Variant = keyof typeof typeScale;

export interface TxtProps {
  variant?: Variant;
  color?: keyof Palette;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
  numberOfLines?: number;
  selectable?: boolean;
  center?: boolean;
  accessibilityRole?: 'header' | 'text';
  /** One line, shrinking the type (to 60% at most) instead of breaking a long word like "Pressefreiheit" in two. */
  fit?: boolean;
}

/** Interface text in Fira Sans. */
export function Txt({ variant = 'body', color = 'ink', style, children, numberOfLines, selectable, center, accessibilityRole, fit }: TxtProps) {
  const { c } = useTheme();
  return (
    <Text
      numberOfLines={fit ? 1 : numberOfLines}
      adjustsFontSizeToFit={fit}
      minimumFontScale={fit ? 0.6 : undefined}
      selectable={selectable}
      accessibilityRole={accessibilityRole}
      maxFontSizeMultiplier={1.6}
      style={[typeScale[variant], { color: c[color] }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

export interface DeProps extends Omit<TxtProps, 'variant'> {
  variant?: 'german' | 'germanStrong' | 'germanLarge' | 'cue' | 'display';
  /** Tap to hear it read aloud (the text itself, or this override). */
  speakable?: boolean | string;
  italic?: boolean;
}

/** German text: always Vollkorn, so the learner can see at a glance what is German. Tap to hear it. */
export function De({ variant = 'german', speakable, italic, style, children, ...rest }: DeProps) {
  const text = typeof speakable === 'string' ? speakable : typeof children === 'string' ? children : null;
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!speakable || !text) return;
    return onSpeaking((now) => setActive(now !== null && now === text.replace(/\s+/g, ' ').trim()));
  }, [speakable, text]);
  const { c } = useTheme();
  const { t } = useI18n();
  const node = (
    <Txt
      {...rest}
      variant={variant}
      style={[italic && { fontFamily: variant === 'german' ? 'Vollkorn_400Regular_Italic' : 'Vollkorn_600SemiBold_Italic' }, active && { color: c.royal }, style]}>
      {children}
    </Txt>
  );
  if (!speakable || !text) return node;
  // the pressable takes the text's place in a row: it grows (or shrinks) the way the text was asked to
  const flex = StyleSheet.flatten(style)?.flex;
  return (
    <Pressable onPress={() => speak(text)} accessibilityRole="button" accessibilityHint={t('ui.readsAloudHint')} hitSlop={4} style={flex ? { flex } : { flexShrink: 1 }}>
      {node}
    </Pressable>
  );
}
