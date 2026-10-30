// About you (src/state/profile.ts): six short fields the tutor's conversation partner uses to talk about the
// learner's own life. Everything is optional, in any language the learner likes, and stays on the phone.

import { router } from 'expo-router';
import { Check, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { filledFields, MAX_FIELD, PROFILE_FIELDS, useProfile, type ProfileField } from '@/state/profile';
import { Button, Paper } from '@/ui/controls';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { TopBar } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

function Field({ field, value, onChange, multiline }: { field: ProfileField; value: string; onChange: (s: string) => void; multiline?: boolean }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="smallStrong" color="inkSoft">
        {t(`profile.${field}`)}
      </Txt>
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChange}
        onBlur={() => {
          setFocused(false);
          onChange(value.trim());
        }}
        onFocus={() => setFocused(true)}
        placeholder={t(`profile.${field}Hint`)}
        placeholderTextColor={c.inkFaint}
        autoCapitalize={field === 'name' || field === 'city' || field === 'from' ? 'words' : 'sentences'}
        autoCorrect={false}
        maxLength={MAX_FIELD}
        multiline={multiline}
        returnKeyType={multiline ? 'default' : 'done'}
        accessibilityLabel={t(`profile.${field}`)}
        style={{
          fontFamily: font.sans,
          fontSize: 16,
          color: c.ink,
          backgroundColor: c.sheet,
          borderRadius: radius.control,
          borderWidth: 1.5,
          borderColor: focused ? c.royal : c.rule,
          paddingHorizontal: space.l,
          paddingVertical: 12,
          minHeight: multiline ? 72 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

export default function ProfileScreen() {
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const profile = useProfile((s) => s.profile);
  const set = useProfile((s) => s.set);
  const clear = useProfile((s) => s.clear);
  const filled = filledFields(profile).length;

  return (
    <KeyboardAvoider style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('profile.title')} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
        <Txt variant="body" color="inkSoft">
          {t('profile.intro')}
        </Txt>
        <Paper style={{ gap: space.l }}>
          {PROFILE_FIELDS.map((f) => (
            <Field key={f} field={f} value={profile[f]} onChange={(v) => set(f, v)} multiline={f === 'hobbies' || f === 'why'} />
          ))}
        </Paper>
        <Txt variant="caption" color="inkFaint">
          {t('profile.privacy')}
        </Txt>
        <View style={{ gap: space.s }}>
          <Button label={t('common.done')} icon={Check} onPress={() => router.back()} />
          {filled ? <Button label={t('profile.clear')} icon={Trash2} kind="quiet" size="medium" onPress={clear} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoider>
  );
}
