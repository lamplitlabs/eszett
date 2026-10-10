import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { useI18n } from '@/i18n';

import { Txt } from './Text';
import { space, useTheme } from './theme';

function Dot({ delay }: { delay: number }) {
  const { c } = useTheme();
  const o = useSharedValue(0.25);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) o.set(withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0.25, { duration: 420 })), -1)));
  }, [delay, o, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.amber }, style]} />;
}

/** Shown while the model reads the question, before its first word arrives. */
export function Thinking({ label }: { label?: string }) {
  const { t } = useI18n();
  const text = label ?? t('ui.thinking');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingVertical: space.xs }} accessibilityLabel={text} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Dot delay={0} />
        <Dot delay={140} />
        <Dot delay={280} />
      </View>
      <Txt variant="small" color="inkSoft">
        {text}
      </Txt>
    </View>
  );
}
