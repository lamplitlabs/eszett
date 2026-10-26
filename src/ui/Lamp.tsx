import { useEffect, useId } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { Connection } from '@/model/runtime';

import { useTheme } from './theme';

/** The lamp is off while there is no model to light it (or the week is over and it waits for the purchase). */
const isOff = (s: Connection) => s === 'absent' || s === 'error' || s === 'unavailable' || s === 'locked';
/** It breathes while something is on its way. */
const isBusy = (s: Connection) => s === 'checking' || s === 'downloading' || s === 'loading';

/**
 * The lamp's light over the top of a screen. It is the app's one ambient animation and it means something:
 * the light is on when the tutor model is ready, breathes while it downloads or loads, sits dim while a download
 * is paused, and is off while the model is not on the phone.
 */
export function LampGlow({ connection, height = 480, style }: { connection: Connection; height?: number; style?: StyleProp<ViewStyle> }) {
  const { c, scheme } = useTheme();
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const reduced = useReducedMotion();
  const level = useSharedValue(0);
  const target = connection === 'ready' ? 1 : isOff(connection) ? 0.12 : connection === 'paused' ? 0.35 : 0.55;
  useEffect(() => {
    if (isBusy(connection) && !reduced) {
      level.set(withRepeat(withSequence(withTiming(0.75, { duration: 1400, easing: Easing.inOut(Easing.quad) }), withTiming(0.35, { duration: 1400, easing: Easing.inOut(Easing.quad) })), -1, true));
    } else {
      level.set(withTiming(target, { duration: reduced ? 0 : 1100, easing: Easing.out(Easing.cubic) }));
    }
  }, [connection, target, reduced, level]);
  const animated = useAnimatedStyle(() => ({ opacity: level.get() }));
  const strength = scheme === 'dark' ? 0.34 : 0.3;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, height }, style]}>
      <Animated.View style={[{ flex: 1 }, animated]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={id} cx="50%" cy="0%" rx="75%" ry="100%" fx="50%" fy="0%">
              <Stop offset="0%" stopColor={c.amber} stopOpacity={strength} />
              <Stop offset="45%" stopColor={c.amber} stopOpacity={strength * 0.35} />
              <Stop offset="100%" stopColor={c.amber} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** A small status light for headers. */
export function StatusLight({ connection, size = 10 }: { connection: Connection; size?: number }) {
  const { c } = useTheme();
  const color = isOff(connection) ? c.inkFaint : c.amber;
  const pulse = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (isBusy(connection) && !reduced) {
      pulse.set(withRepeat(withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })), -1));
    } else pulse.set(withTiming(connection === 'paused' ? 0.5 : 1, { duration: 200 }));
  }, [connection, pulse, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const hollow = isOff(connection);
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: hollow ? 'transparent' : color,
          borderWidth: hollow ? 1.5 : 0,
          borderColor: color,
          shadowColor: c.amber,
          shadowOpacity: connection === 'ready' ? 0.8 : 0,
          shadowRadius: 5,
          shadowOffset: { width: 0, height: 0 },
        },
        animated,
      ]}
    />
  );
}
