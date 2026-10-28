import { ArrowUp, Mic, Square } from 'lucide-react-native';
import { forwardRef, type ReactNode } from 'react';
import { Platform, TextInput, View } from 'react-native';

import { useI18n } from '@/i18n';

import { Press } from './controls';
import { haptic } from './haptics';
import { font, radius, space, useTheme } from './theme';

interface Props {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  onStop?: () => void;
  busy?: boolean;
  placeholder: string;
  /** Chips or tools above the field. */
  above?: ReactNode;
  /** Write German in Vollkorn (role-play lines, sentences to check). */
  german?: boolean;
  disabled?: boolean;
  /** A microphone that dictates into the field (German, on the phone); `listening` while a turn runs. */
  dictation?: { listening: boolean; onPress: () => void };
}

/** The writing field at the bottom of a conversation. While the tutor writes, send turns into stop. */
export const Composer = forwardRef<TextInput, Props>(function Composer({ value, onChange, onSend, onStop, busy, placeholder, above, german, disabled, dictation }, ref) {
  const { c } = useTheme();
  const { t } = useI18n();
  const canSend = value.trim().length > 0 && !busy && !disabled;
  return (
    <View style={{ paddingHorizontal: space.m, paddingTop: space.s, paddingBottom: space.s, backgroundColor: c.paper, borderTopWidth: 1, borderTopColor: c.rule, gap: space.s }}>
      {above}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s }}>
        {dictation ? (
          <Press
            onPress={() => {
              haptic.soft();
              dictation.onPress();
            }}
            disabled={disabled}
            accessibilityLabel={dictation.listening ? t('ui.stopDictation') : t('ui.dictate')}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: dictation.listening ? c.red : c.sheetAlt, alignItems: 'center', justifyContent: 'center' }}>
            {dictation.listening ? <Square size={16} color={c.paper} fill={c.paper} /> : <Mic size={21} color={c.ink} strokeWidth={2.2} />}
          </Press>
        ) : null}
        <View style={{ flex: 1, minHeight: 46, maxHeight: 140, borderRadius: radius.control + 4, backgroundColor: c.sheet, borderWidth: 1, borderColor: c.rule, paddingHorizontal: space.l, justifyContent: 'center' }}>
          <TextInput
            ref={ref}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={c.inkFaint}
            multiline
            editable={!disabled}
            autoCorrect={false}
            autoCapitalize="sentences"
            spellCheck={false}
            submitBehavior="submit"
            returnKeyType="send"
            onSubmitEditing={() => canSend && onSend()}
            accessibilityLabel={placeholder}
            style={{
              fontFamily: german ? font.de : font.sans,
              fontSize: german ? 18 : 16,
              lineHeight: german ? 24 : 22,
              color: german ? c.royal : c.ink,
              paddingTop: Platform.OS === 'ios' ? 12 : 8,
              paddingBottom: Platform.OS === 'ios' ? 12 : 8,
              outlineStyle: 'none',
            } as object}
          />
        </View>
        {busy && onStop ? (
          <Press onPress={onStop} accessibilityLabel={t('ui.stopAnswer')} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Square size={16} color={c.paper} fill={c.paper} />
          </Press>
        ) : (
          <Press
            onPress={() => {
              haptic.soft();
              onSend();
            }}
            disabled={!canSend}
            feedback={false}
            accessibilityLabel={t('ui.send')}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: canSend ? c.royal : c.sheetAlt, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowUp size={22} color={canSend ? c.onRoyal : c.inkFaint} strokeWidth={2.4} />
          </Press>
        )}
      </View>
    </View>
  );
});
