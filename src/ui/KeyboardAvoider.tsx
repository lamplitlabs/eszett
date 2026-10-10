import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, View, type KeyboardMetrics, type StyleProp, type ViewStyle } from 'react-native';

interface Props {
  children: ReactNode;
  /** Give it `flex: 1`: it fills its parent and keeps the bottom of its content above the keyboard. */
  style?: StyleProp<ViewStyle>;
}

/**
 * Keeps what is at the bottom (a composer, an answer field) above the soft keyboard.
 *
 * iOS uses React Native's KeyboardAvoidingView. Android draws edge-to-edge, so `adjustResize` no longer
 * shrinks the window and the stock view (which only knows its parent-relative frame) under-pads nested
 * screens; instead we measure where this view ends on screen and pad away the part the keyboard covers.
 */
export function KeyboardAvoider(props: Props) {
  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView behavior="padding" style={props.style}>
        {props.children}
      </KeyboardAvoidingView>
    );
  }
  return <AndroidAvoider {...props} />;
}

function AndroidAvoider({ children, style }: Props) {
  const ref = useRef<View>(null);
  const [pad, setPad] = useState(0);

  const fit = useCallback((keyboard: KeyboardMetrics | null | undefined) => {
    if (!keyboard) {
      setPad(0);
      return;
    }
    ref.current?.measureInWindow((_x, y, _w, h) => setPad(Math.max(0, Math.round(y + h - keyboard.screenY))));
  }, []);

  useEffect(() => {
    // Android re-emits keyboardDidShow when the keyboard changes height (emoji panel, number row).
    const show = Keyboard.addListener('keyboardDidShow', (e) => fit(e.endCoordinates));
    const hide = Keyboard.addListener('keyboardDidHide', () => fit(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [fit]);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[style, { paddingBottom: pad }]}
      onLayout={() => {
        // Mounted (or resized) while the keyboard is already up, e.g. after navigating with it open.
        if (pad === 0 && Keyboard.isVisible()) fit(Keyboard.metrics());
      }}
    >
      {children}
    </View>
  );
}
