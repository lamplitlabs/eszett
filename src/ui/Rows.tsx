// The list rows of the settings-style screens: a label with a detail line and something on the right, a
// switch, and a row that leads somewhere (icon, label, detail, chevron).
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Switch, View } from 'react-native';

import { Press } from '@/ui/controls';
import { Txt } from '@/ui/Text';
import { space, useTheme } from '@/ui/theme';

export function Row({ label, detail, left, right, onPress }: { label: string; detail?: string; left?: ReactNode; right?: ReactNode; onPress?: () => void }) {
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m }}>
      {left}
      <View style={{ flex: 1 }}>
        <Txt variant="body">{label}</Txt>
        {detail ? (
          <Txt variant="small" color="inkSoft">
            {detail}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
  return onPress ? (
    <Press onPress={onPress} scaleTo={0.99} accessibilityLabel={label}>
      {body}
    </Press>
  ) : (
    body
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  return <Switch value={value} onValueChange={onChange} trackColor={{ true: c.royal, false: c.rule }} thumbColor="#fff" accessibilityLabel={label} />;
}

/** A row that opens another screen: an icon (or any element) on the left, a chevron on the right. */
export function LinkRow({ icon: Icon, left, label, detail, tone = 'soft', onPress }: { icon?: LucideIcon; left?: ReactNode; label: string; detail?: string; tone?: 'soft' | 'royal' | 'red' | 'amber'; onPress: () => void }) {
  const { c } = useTheme();
  const color = tone === 'royal' ? c.royal : tone === 'red' ? c.red : tone === 'amber' ? c.amberInk : c.inkSoft;
  return (
    <Press onPress={onPress} scaleTo={0.99} accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m }}>
        {left ?? (Icon ? <Icon size={20} color={color} /> : null)}
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong" style={tone === 'soft' ? undefined : { color }}>
            {label}
          </Txt>
          {detail ? (
            <Txt variant="small" color="inkSoft" numberOfLines={2}>
              {detail}
            </Txt>
          ) : null}
        </View>
        <ChevronRight size={18} color={c.inkFaint} />
      </View>
    </Press>
  );
}
