// The two players' names, editable wherever a Together activity shows them: the hub and each game.
// A pencil in each field says it can be tapped, and the border lights up while a name is being typed.

import { Pencil, Users } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useTogether } from '@/features/together';
import { useI18n } from '@/i18n';
import { Txt } from '@/ui/Text';
import { font, radius, space, useTheme } from '@/ui/theme';

function NameField({ value, placeholder, autoFocus, onChange }: { value: string; placeholder: string; autoFocus?: boolean; onChange: (s: string) => void }) {
  const { c } = useTheme();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={() => input.current?.focus()}
      accessible={false}
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s, backgroundColor: c.sheet, borderRadius: radius.control, borderWidth: 1.5, borderColor: focused ? c.royal : c.rule, paddingLeft: space.l, paddingRight: space.m }}
    >
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChange}
        // a trailing space while typing is fine; the stored name is tidy once the field is left
        onBlur={() => {
          setFocused(false);
          onChange(value.trim());
        }}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={c.inkFaint}
        autoCapitalize="words"
        autoCorrect={false}
        autoFocus={autoFocus}
        maxLength={24}
        returnKeyType="done"
        accessibilityLabel={placeholder}
        style={{ flex: 1, fontFamily: font.sans, fontSize: 16, color: c.ink, paddingVertical: 12, outlineStyle: 'none' } as object}
      />
      <Pencil size={16} color={focused ? c.royal : c.inkFaint} />
    </Pressable>
  );
}

/** "Who's playing?" with a field per player; the names live in `useTogether`, so every screen sees the change. */
export function PlayerNames({ autoFocus }: { autoFocus?: boolean }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const names = useTogether((s) => s.names);
  const setName = useTogether((s) => s.setName);
  return (
    <View style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <Users size={16} color={c.inkSoft} />
        <Txt variant="smallStrong" color="inkSoft">
          {t('together.whoPlays')}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <NameField value={names[0]} placeholder={t('together.playerN', { n: 1 })} autoFocus={autoFocus} onChange={(s) => setName(0, s)} />
        <NameField value={names[1]} placeholder={t('together.playerN', { n: 2 })} onChange={(s) => setName(1, s)} />
      </View>
    </View>
  );
}
