// The living streak flame: it flickers while the streak is alive, grows a little with its length, and flares
// up (a bounce and a glow) when the number goes up. Reduced motion: a still flame.

import { Flame } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { useTheme } from '../theme';

export function StreakFlame({ streak, size = 16 }: { streak: number; size?: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const flicker = useSharedValue(1);
  const flare = useSharedValue(1);
  const glow = useSharedValue(0);
  const previous = useRef(streak);

  useEffect(() => {
    if (reduced || streak <= 0) {
      flicker.set(1);
      return;
    }
    // a slow breath, faster and taller the longer the streak
    const period = Math.max(650, 1100 - streak * 25);
    flicker.set(withRepeat(withSequence(withTiming(1.12, { duration: period, easing: Easing.inOut(Easing.quad) }), withTiming(0.94, { duration: period, easing: Easing.inOut(Easing.quad) })), -1, true));
  }, [flicker, reduced, streak]);

  useEffect(() => {
    if (streak > previous.current && !reduced) {
      flare.set(withSequence(withSpring(1.6, { damping: 6, stiffness: 220 }), withSpring(1, { damping: 10, stiffness: 160 })));
      glow.set(withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 900 })));
    }
    previous.current = streak;
  }, [flare, glow, reduced, streak]);

  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flicker.get() * flare.get() }, { rotate: `${(flicker.get() - 1) * 40}deg` }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() * 0.9, transform: [{ scale: 1 + glow.get() * 1.6 }] }));

  const colour = streak >= 30 ? c.red : streak >= 7 ? c.amber : c.amberInk;
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: c.amber }, glowStyle]} />
      <Animated.View style={flameStyle}>
        <Flame size={size} color={colour} fill={streak >= 7 ? colour : 'transparent'} strokeWidth={2.2} />
      </Animated.View>
    </View>
  );
}
