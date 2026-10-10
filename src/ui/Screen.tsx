import { router } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { forwardRef, type ReactNode } from 'react';
import { BlurView } from 'expo-blur';
import { Platform, ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from './controls';
import { Txt } from './Text';
import { gutter, space, useTheme } from './theme';

/** The top inset a screen has to add itself (iOS tab screens get it from the scroll view). */
export function useTopInset(autoInset: boolean) {
  const insets = useSafeAreaInsets();
  return autoInset && Platform.OS === 'ios' ? 0 : insets.top;
}

export interface ScreenProps extends Omit<ScrollViewProps, 'children'> {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  /** Drawn behind the content, fixed while it scrolls (the lamp's light). */
  backdrop?: ReactNode;
  children?: ReactNode;
}

/** A tab screen: a scrolling page with a large title. */
export const Screen = forwardRef<ScrollView, ScreenProps>(function Screen({ title, subtitle, right, backdrop, children, contentContainerStyle, ...rest }, ref) {
  const { c } = useTheme();
  const top = useTopInset(true);
  // The scroll view is the screen's first child: iOS native tabs look for it to size their insets and to keep
  // the tab bar opaque. The backdrop (the lamp's light) lives inside it and reaches up under the status bar.
  return (
    <View style={{ flex: 1, backgroundColor: c.paper }} collapsable={false}>
      <ScrollView
        ref={ref}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingTop: top + space.l, paddingHorizontal: gutter, paddingBottom: 56 }, contentContainerStyle]}
        {...rest}>
        {backdrop ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: -110, left: 0, right: 0, height: 480 }}>
            {backdrop}
          </View>
        ) : null}
        {title ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: space.xl, gap: space.m }}>
            <View style={{ flex: 1 }}>
              <Txt variant="title" accessibilityRole="header">
                {title}
              </Txt>
              {subtitle ? (
                <Txt variant="body" color="inkSoft" style={{ marginTop: 2 }}>
                  {subtitle}
                </Txt>
              ) : null}
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </ScrollView>
      <StatusBarScrim />
    </View>
  );
});

/** Content scrolls under the status bar; a band of frosted paper keeps the time and battery legible. */
function StatusBarScrim() {
  const insets = useSafeAreaInsets();
  const { scheme, c } = useTheme();
  if (Platform.OS === 'web' || !insets.top) return null;
  return (
    <BlurView
      pointerEvents="none"
      intensity={Platform.OS === 'ios' ? 50 : 0}
      tint={scheme === 'dark' ? 'dark' : 'light'}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: Platform.OS === 'ios' ? `${c.paper}B3` : c.paper }}
    />
  );
}

/** The bar on a pushed screen: back (or close) on the left, a title, an optional action on the right. */
export function TopBar({ title, close, right, onBack }: { title?: string; close?: boolean; right?: ReactNode; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={{ paddingTop: insets.top + space.xs, paddingHorizontal: space.m, paddingBottom: space.s, flexDirection: 'row', alignItems: 'center', gap: space.s, backgroundColor: c.paper }}>
      <IconButton icon={close ? X : ChevronLeft} label={close ? 'Close' : 'Back'} onPress={back} tone="sheet" size={38} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        {title ? (
          <Txt variant="smallStrong" numberOfLines={1}>
            {title}
          </Txt>
        ) : null}
      </View>
      <View style={{ minWidth: 38, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

/** A section heading inside a page. */
export function Section({ title, action, children, style }: { title: string; action?: ReactNode; children?: ReactNode; style?: object }) {
  return (
    <View style={[{ marginBottom: space.x3 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.m }}>
        <Txt variant="headline" accessibilityRole="header">
          {title}
        </Txt>
        {action}
      </View>
      {children}
    </View>
  );
}
