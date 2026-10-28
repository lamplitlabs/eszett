import type { LucideIcon } from 'lucide-react-native';
import { Volume2 } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useI18n } from '@/i18n';

import { haptic } from './haptics';
import { onSpeaking, speak } from './speech';
import { Txt } from './Text';
import { genderColor, genderTint, radius, space, useTheme, type Palette } from './theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressProps {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link' | 'tab' | 'radio' | 'checkbox';
  accessibilityState?: { selected?: boolean; checked?: boolean; disabled?: boolean };
  /** How far it sinks when pressed (1 = not at all). */
  scaleTo?: number;
  hitSlop?: number;
  feedback?: boolean;
  /** Fade when disabled (off for answered choices, which show their result instead). */
  dimWhenDisabled?: boolean;
}

/** A pressable that answers the finger: it sinks slightly and ticks. */
export function Press({ onPress, onLongPress, disabled, style, children, scaleTo = 0.97, feedback = true, hitSlop, dimWhenDisabled = true, accessibilityRole = 'button', ...a11y }: PressProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      {...a11y}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: Boolean(disabled), ...a11y.accessibilityState }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => scale.set(withTiming(scaleTo, { duration: 90 }))}
      onPressOut={() => scale.set(withSpring(1, { damping: 14, stiffness: 260 }))}
      onPress={() => {
        if (feedback) haptic.tap();
        onPress?.();
      }}
      onLongPress={onLongPress}
      style={[animated, style, disabled && dimWhenDisabled && { opacity: 0.45 }]}>
      {children}
    </AnimatedPressable>
  );
}

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'quiet' | 'pen';
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  size?: 'large' | 'medium' | 'small';
  style?: StyleProp<ViewStyle>;
  grow?: boolean;
  accessibilityHint?: string;
}

export function Button({ label, onPress, kind = 'primary', icon: Icon, loading, disabled, size = 'large', style, grow, accessibilityHint }: ButtonProps) {
  const { c } = useTheme();
  const height = size === 'large' ? 54 : size === 'medium' ? 44 : 36;
  const bg = kind === 'primary' ? c.royal : kind === 'secondary' ? c.sheet : kind === 'pen' ? c.redTint : 'transparent';
  const fg = kind === 'primary' ? c.onRoyal : kind === 'pen' ? c.red : kind === 'quiet' ? c.royal : c.ink;
  return (
    <Press
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={[
        {
          height,
          borderRadius: size === 'small' ? radius.small : radius.control,
          backgroundColor: bg,
          paddingHorizontal: size === 'small' ? space.m : space.xl,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.s,
          borderWidth: kind === 'secondary' ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: c.rule,
        },
        grow && { flex: 1 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : Icon ? <Icon size={size === 'small' ? 16 : 19} color={fg} strokeWidth={2} /> : null}
      <Txt variant={size === 'small' ? 'smallStrong' : 'bodyStrong'} style={{ color: fg }} numberOfLines={1}>
        {label}
      </Txt>
    </Press>
  );
}

/** A round icon button (close, send, speak). */
export function IconButton({
  icon: Icon,
  onPress,
  label,
  tone = 'plain',
  size = 40,
  disabled,
  style,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  tone?: 'plain' | 'filled' | 'sheet';
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = tone === 'filled' ? c.royal : tone === 'sheet' ? c.sheetAlt : 'transparent';
  const fg = tone === 'filled' ? c.onRoyal : c.ink;
  return (
    <Press onPress={onPress} disabled={disabled} accessibilityLabel={label} hitSlop={6} style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }, style]}>
      <Icon size={Math.round(size * 0.48)} color={fg} strokeWidth={2} />
    </Press>
  );
}

/** A raised sheet of paper: crisp edge, no drop shadow. */
export function Paper({ children, style, tone = 'sheet' }: { children?: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'sheet' | 'alt' | 'amber' | 'royal' | 'red' | 'green' }) {
  const { c } = useTheme();
  const bg = { sheet: c.sheet, alt: c.sheetAlt, amber: c.amberTint, royal: c.royalTint, red: c.redTint, green: c.greenTint }[tone];
  return (
    <View style={[{ backgroundColor: bg, borderRadius: radius.sheet, borderWidth: tone === 'sheet' ? StyleSheet.hairlineWidth * 2 : 0, borderColor: c.rule, padding: space.l }, style]}>
      {children}
    </View>
  );
}

/** The article in its gender colour: der (blue), die (red), das (green). */
export function GenderChip({ article, size = 'medium' }: { article: string | null | undefined; size?: 'small' | 'medium' | 'large' }) {
  const { c } = useTheme();
  const { t } = useI18n();
  if (!article) return null;
  const big = size === 'large';
  return (
    <View
      accessibilityLabel={t('ui.articleLabel', { article })}
      style={{
        backgroundColor: genderTint(c, article),
        borderRadius: radius.pill,
        paddingHorizontal: big ? 12 : size === 'small' ? 7 : 9,
        paddingVertical: big ? 3 : 1,
        alignSelf: 'flex-start',
      }}>
      <Txt variant={big ? 'germanStrong' : size === 'small' ? 'caption' : 'smallStrong'} style={{ color: genderColor(c, article), fontFamily: 'Vollkorn_600SemiBold' }}>
        {article}
      </Txt>
    </View>
  );
}

export function Pill({
  label,
  icon: Icon,
  tone = 'plain',
  onPress,
  selected,
  disabled,
}: {
  label: string;
  icon?: LucideIcon;
  tone?: 'plain' | 'amber' | 'royal' | 'green' | 'red';
  onPress?: () => void;
  selected?: boolean;
  /** Shown dimmed and not pressable: an option that exists but is not available yet. */
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const map: Record<string, [string, string]> = {
    plain: [selected ? c.ink : c.sheetAlt, selected ? c.paper : c.inkSoft],
    amber: [c.amberTint, c.amberInk],
    royal: [c.royalTint, c.royal],
    green: [c.greenTint, c.green],
    red: [c.redTint, c.red],
  };
  const [bg, fg] = map[tone];
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, opacity: disabled ? 0.4 : 1 }}>
      {Icon ? <Icon size={13} color={fg} strokeWidth={2.2} /> : null}
      <Txt variant="caption" style={{ color: fg, flexShrink: 1 }}>
        {label}
      </Txt>
    </View>
  );
  if (disabled) {
    return (
      <View accessibilityRole="button" accessibilityState={{ disabled: true, selected }} accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  if (!onPress) return body;
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label}>
      {body}
    </Press>
  );
}

/** A speaker button that reads German aloud and shows when it is speaking. */
export function SpeakButton({ text, size = 34, tone = 'sheet' }: { text: string; size?: number; tone?: 'sheet' | 'plain' }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const clean = text.replace(/\*\*|__|[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  const [active, setActive] = useState(false);
  useEffect(() => onSpeaking((now) => setActive(now === clean)), [clean]);
  return (
    <Press
      onPress={() => speak(text)}
      accessibilityLabel={t('ui.readAloud')}
      hitSlop={6}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.royal : tone === 'sheet' ? c.sheetAlt : 'transparent' }}>
      <Volume2 size={Math.round(size * 0.5)} color={active ? c.onRoyal : c.royal} strokeWidth={2} />
    </Press>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.rule, marginLeft: inset }} />;
}

/** A thin bar for progress through a set. */
export function ProgressBar({ value, color }: { value: number; color?: keyof Palette }) {
  const { c } = useTheme();
  const w = useSharedValue(0);
  useEffect(() => {
    w.set(withTiming(Math.max(0, Math.min(1, value)), { duration: 380 }));
  }, [value, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: c.sheetAlt, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: c[color ?? 'royal'] }, fill]} />
    </View>
  );
}

/** A German line the learner can tap to use (role-play suggestions). */
export function GermanChip({ text, onPress }: { text: string; onPress: () => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  return (
    <Press onPress={onPress} accessibilityLabel={t('ui.useLine', { text })} style={{ backgroundColor: c.royalTint, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 }}>
      <Txt style={{ fontFamily: 'Vollkorn_400Regular', fontSize: 16, lineHeight: 21, color: c.royal }}>{text}</Txt>
    </Press>
  );
}
