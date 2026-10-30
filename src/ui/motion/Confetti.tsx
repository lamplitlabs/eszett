// Confetti: a burst of small paper pieces in the app's colours that fall, drift and spin, then fade. Fired once
// per `shot` value (change it to fire again); honours reduced motion by showing nothing. Pure Reanimated, no
// assets, so it weighs nothing and matches the palette in both appearances.

import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '../theme';

interface Piece {
  x: number;
  delay: number;
  drift: number;
  spin: number;
  size: number;
  color: string;
  round: boolean;
  duration: number;
}

/** A deterministic sequence per shot, so a re-render does not reshuffle the pieces mid-flight. */
function pieces(seed: number, count: number, width: number, colors: string[]): Piece[] {
  let s = (Math.abs(Math.floor(seed)) * 9301 + 49297) % 233280;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  return Array.from({ length: count }, () => ({
    x: rnd() * width,
    delay: rnd() * 350,
    drift: (rnd() - 0.5) * 140,
    spin: (rnd() - 0.5) * 1080,
    size: 6 + rnd() * 8,
    color: colors[Math.floor(rnd() * colors.length)],
    round: rnd() > 0.6,
    duration: 1600 + rnd() * 900,
  }));
}

function PieceView({ piece, height, progress }: { piece: Piece; height: number; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    const local = Math.max(0, Math.min(1, (p * 2600 - piece.delay) / piece.duration));
    const ease = local * local * (3 - 2 * local);
    return {
      opacity: local < 0.85 ? 1 : (1 - local) / 0.15,
      transform: [{ translateX: piece.x + piece.drift * ease }, { translateY: -40 + (height + 60) * ease }, { rotate: `${piece.spin * ease}deg` }, { scaleY: 0.6 + 0.4 * Math.abs(Math.cos(ease * 6)) }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.piece, { width: piece.size, height: piece.round ? piece.size : piece.size * 0.6, borderRadius: piece.round ? piece.size / 2 : 2, backgroundColor: piece.color }, style]} />;
}

/**
 * Fills its parent (position it absolutely over a screen or a card) and fires when `shot` changes to a truthy
 * value. `count` pieces; `height` is how far they fall (the window's height by default).
 */
export function Confetti({ shot, count = 48, height }: { shot: number | string | boolean; count?: number; height?: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const window = useWindowDimensions();
  const fall = height ?? window.height;
  const progress = useSharedValue(0);
  const seed = typeof shot === 'number' ? shot : typeof shot === 'string' ? shot.length * 31 + (shot.charCodeAt(0) || 1) : 7;
  const colors = useMemo(() => [c.royal, c.amber, c.green, c.red, c.die, c.der, c.das], [c]);
  const list = useMemo(() => pieces(seed, count, window.width, colors), [seed, count, window.width, colors]);

  useEffect(() => {
    if (!shot || reduced) return;
    progress.set(0);
    progress.set(withDelay(60, withTiming(1, { duration: 2600, easing: Easing.linear })));
  }, [shot, reduced, progress]);

  if (!shot || reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {list.map((p, i) => (
        <PieceView key={i} piece={p} height={fall} progress={progress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ piece: { position: 'absolute', top: 0, left: 0 } });
