import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { DynamicColorIOS, Platform } from 'react-native';

import { useI18n } from '@/i18n';
import { useSettings } from '@/state/settings';
import { useTheme } from '@/ui/theme';

export default function TabLayout() {
  const { c } = useTheme();
  const { t } = useI18n();
  const onboarded = useSettings((s) => s.onboarded);
  if (!onboarded) return <Redirect href="/onboarding" />;
  const tint = Platform.OS === 'ios' ? DynamicColorIOS({ light: '#2442C6', dark: '#8197FF' }) : c.royal;
  return (
    <NativeTabs
      tintColor={tint}
      backgroundColor={c.paper}
      indicatorColor={c.royalTint}
      labelStyle={{ fontFamily: 'FiraSans_500Medium', fontSize: 11 }}
      minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Label>{t('tabs.today')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'lamp.desk', selected: 'lamp.desk.fill' }} md="lightbulb" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tutor" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Label>{t('tabs.tutor')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.text.bubble.right', selected: 'bubble.left.and.text.bubble.right.fill' }} md="forum" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="practice" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Label>{t('tabs.practice')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'pencil.and.list.clipboard', selected: 'pencil.and.list.clipboard' }} md="edit_note" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scenes" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Label>{t('tabs.scenes')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'theatermasks', selected: 'theatermasks.fill' }} md="theater_comedy" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="me" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Label>{t('tabs.me')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
