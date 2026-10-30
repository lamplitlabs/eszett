// The celebration: a full-screen moment when something worth marking happens - the day's lesson done, a week of
// the course finished, an exam passed, a streak milestone. A badge pops in, confetti falls, a German cheer and
// one line about what was achieved; a tap or a few seconds later it is gone. One component, mounted once at the
// root, driven by the small store below so any screen can fire it with a single call.

import { Check, Flame, GraduationCap, Mic, Route, Sparkles, Trophy, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { create } from 'zustand';

import { haptic } from '../haptics';
import { De, Txt } from '../Text';
import { gutter, space, useTheme, type Palette } from '../theme';
import { Confetti } from './Confetti';

export type CelebrationKind = 'lesson' | 'week' | 'exam' | 'streak' | 'speaking' | 'level' | 'done';

export interface Celebration {
  kind: CelebrationKind;
  /** The German cheer, large ("Geschafft!"). */
  cheer: string;
  /** What was achieved, in the app language. */
  title: string;
  detail?: string;
  /** A streak to show with the flame, when it is part of the moment. */
  streak?: number;
}

interface CelebrationState {
  current: (Celebration & { shot: number }) | null;
  show: (c: Celebration) => void;
  hide: () => void;
}

export const useCelebration = create<CelebrationState>()((set, get) => ({
  current: null,
  show: (c) => set({ current: { ...c, shot: (get().current?.shot ?? 0) + 1 } }),
  hide: () => set({ current: null }),
}));

/** Fires a celebration from anywhere (a screen's effect, a store). */
export const celebrate = (c: Celebration) => useCelebration.getState().show(c);

const ICON: Record<CelebrationKind, LucideIcon> = { lesson: Check, week: Route, exam: GraduationCap, streak: Flame, speaking: Mic, level: Trophy, done: Sparkles };
const TONE: Record<CelebrationKind, keyof Palette> = { lesson: 'green', week: 'royal', exam: 'green', streak: 'amber', speaking: 'red', level: 'amber', done: 'royal' };

/** The German cheers, in rotation; picked by the shot so the same moment reads the same while it is on screen. */
export const CHEERS = ['Geschafft!', 'Super!', 'Klasse!', 'Weiter so!', 'Stark!', 'Toll gemacht!', 'Prima!'];
export const cheerFor = (n: number) => CHEERS[Math.abs(n) % CHEERS.length];

export function CelebrationOverlay() {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const current = useCelebration((s) => s.current);
  const hide = useCelebration((s) => s.hide);
  const pop = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    if (!current) return;
    haptic.success();
    pop.set(0);
    ring.set(0);
    pop.set(reduced ? 1 : withDelay(80, withSpring(1, { damping: 9, stiffness: 180 })));
    ring.set(reduced ? 1 : withDelay(120, withSequence(withTiming(1, { duration: 700 }), withTiming(1, { duration: 1 }))));
    const timer = setTimeout(hide, 3600);
    return () => clearTimeout(timer);
  }, [current, hide, pop, reduced, ring]);

  const badge = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }], opacity: pop.get() }));
  const halo = useAnimatedStyle(() => ({ opacity: (1 - ring.get()) * 0.5, transform: [{ scale: 1 + ring.get() * 1.4 }] }));

  if (!current) return null;
  const Icon = ICON[current.kind];
  const tone = c[TONE[current.kind]];
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(220)} style={[StyleSheet.absoluteFill, { zIndex: 50 }]} pointerEvents="box-none">
      <Pressable onPress={hide} accessibilityRole="button" accessibilityLabel={current.title} style={[StyleSheet.absoluteFill, { backgroundColor: c.paper + 'E6', alignItems: 'center', justifyContent: 'center', paddingHorizontal: gutter }]}>
        <Confetti shot={current.shot} count={64} />
        <View style={{ alignItems: 'center', gap: space.m }}>
          <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: tone }, halo]} />
            <Animated.View style={[{ width: 120, height: 120, borderRadius: 60, backgroundColor: tone, alignItems: 'center', justifyContent: 'center', shadowColor: tone, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }, badge]}>
              <Icon size={56} color={c.onRoyal} strokeWidth={2.4} />
            </Animated.View>
          </View>
          <Animated.View entering={FadeInUp.delay(reduced ? 0 : 260).duration(400)} style={{ alignItems: 'center', gap: space.s }}>
            <De variant="display" style={{ fontSize: 40, lineHeight: 46, textAlign: 'center' }}>
              {current.cheer}
            </De>
            <Txt variant="headline" center>
              {current.title}
            </Txt>
            {current.detail ? (
              <Txt variant="body" color="inkSoft" center>
                {current.detail}
              </Txt>
            ) : null}
            {current.streak && current.streak > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.s, paddingHorizontal: space.l, paddingVertical: space.s, borderRadius: 999, backgroundColor: c.amberTint }}>
                <Flame size={18} color={c.amberInk} fill={current.streak >= 7 ? c.amberInk : 'transparent'} />
                <Txt variant="bodyStrong" style={{ color: c.amberInk }}>
                  {current.streak}
                </Txt>
              </View>
            ) : null}
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
