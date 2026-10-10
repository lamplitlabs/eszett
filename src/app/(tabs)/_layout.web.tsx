// On the web there is no system tab bar: the app sits in a phone-width column with its own tab bar.
import { Redirect } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { CircleUser, Drama, Lamp, MessagesSquare, NotebookPen, type LucideIcon } from 'lucide-react-native';
import { forwardRef } from 'react';
import { Pressable, View } from 'react-native';

import { useI18n } from '@/i18n';
import { useSettings } from '@/state/settings';
import { Txt } from '@/ui/Text';
import { useTheme } from '@/ui/theme';

const TabButton = forwardRef<View, TabTriggerSlotProps & { icon: LucideIcon; label: string }>(function TabButton({ icon: Icon, label, isFocused, ...props }, ref) {
  const { c } = useTheme();
  const color = isFocused ? c.royal : c.inkFaint;
  return (
    <Pressable ref={ref} {...props} accessibilityRole="tab" accessibilityState={{ selected: isFocused }} style={{ flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 6, gap: 2 }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 3, borderRadius: 999, backgroundColor: isFocused ? c.royalTint : 'transparent' }}>
        <Icon size={21} color={color} strokeWidth={isFocused ? 2.3 : 1.9} />
      </View>
      <Txt variant="caption" style={{ color, fontSize: 11 }}>
        {label}
      </Txt>
    </Pressable>
  );
});

export default function WebTabs() {
  const { c } = useTheme();
  const { t } = useI18n();
  const onboarded = useSettings((s) => s.onboarded);
  if (!onboarded) return <Redirect href="/onboarding" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ flex: 1 }}>
        <Tabs>
          <TabSlot style={{ flex: 1 }} />
          <TabList style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.rule, backgroundColor: c.paper }}>
            <TabTrigger name="index" href="/" asChild>
              <TabButton icon={Lamp} label={t('tabs.today')} />
            </TabTrigger>
            <TabTrigger name="tutor" href="/tutor" asChild>
              <TabButton icon={MessagesSquare} label={t('tabs.tutor')} />
            </TabTrigger>
            <TabTrigger name="practice" href="/practice" asChild>
              <TabButton icon={NotebookPen} label={t('tabs.practice')} />
            </TabTrigger>
            <TabTrigger name="scenes" href="/scenes" asChild>
              <TabButton icon={Drama} label={t('tabs.scenes')} />
            </TabTrigger>
            <TabTrigger name="me" href="/me" asChild>
              <TabButton icon={CircleUser} label={t('tabs.me')} />
            </TabTrigger>
          </TabList>
        </Tabs>
      </View>
    </View>
  );
}
