// A number that counts up to its value when it appears (a score, words a minute), with a soft overshoot; and a
// progress ring that fills itself. Reduced motion: both jump to the final value.

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Txt } from '../Text';
import { useTheme, type Palette } from '../theme';

/** Counts from 0 to `value` over `duration` ms; renders through `render` (default: the integer). */
export function CountUp({ value, duration = 900, delay = 150, render, style, variant = 'title' }: { value: number; duration?: number; delay?: number; render?: (n: number) => string; style?: object; variant?: 'title' | 'headline' | 'display' | 'bodyStrong' }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    let frame = 0;
    // reduced motion still goes through the frame callback, in one step, so no state is set in the effect itself
    if (reduced) {
      frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      // ease out with a touch of overshoot, settled by the end
      const eased = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
      setShown(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [delay, duration, reduced, value]);
  return (
    <Txt variant={variant} style={[{ fontVariant: ['tabular-nums'] }, style]}>
      {render ? render(shown) : String(shown)}
    </Txt>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** A ring that fills to `value` (0..1); the children sit in the middle. */
export function ProgressRing({ value, size = 120, stroke = 10, color = 'royal', track, children, delay = 200 }: { value: number; size?: number; stroke?: number; color?: keyof Palette; track?: keyof Palette; children?: React.ReactNode; delay?: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(reduced ? value : 0);
  useEffect(() => {
    progress.set(reduced ? Math.max(0, Math.min(1, value)) : withDelay(delay, withTiming(Math.max(0, Math.min(1, value)), { duration: 1100, easing: Easing.out(Easing.cubic) })));
  }, [delay, progress, reduced, value]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - progress.get()) }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={track ? c[track] : c.sheetAlt} strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={radius} stroke={c[color]} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} animatedProps={props} />
      </Svg>
      {children}
    </View>
  );
}
