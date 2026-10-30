// The account: who is signed in, what the account holds, sign out, delete. Only in builds with accounts.
import { router } from 'expo-router';
import { LogIn, LogOut, Trash2 } from 'lucide-react-native';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/features/account';
import { useI18n } from '@/i18n';
import { Avatar } from '@/ui/Avatar';
import { Divider, Paper } from '@/ui/controls';
import { LinkRow } from '@/ui/Rows';
import { TopBar } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { gutter, space, useTheme } from '@/ui/theme';

export default function AccountScreen() {
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const plan = account.me?.plan === 'full' ? (account.me.updatesLeftDays > 0 ? t('unlock.updatesLeft', { count: account.me.updatesLeftDays }) : t('unlock.updatesOver')) : t('unlock.accountFree');

  const confirmDelete = () =>
    Alert.alert(t('me.deleteAccount'), t('me.deleteAccountConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('me.deleteAccountYes'),
        style: 'destructive',
        onPress: () => {
          void account.deleteAccount().then(
            () => {
              Alert.alert(t('me.deleteAccountDone'));
              if (router.canGoBack()) router.back();
            },
            (e: unknown) => Alert.alert(t('me.deleteAccount'), t('me.deleteAccountFailed', { reason: e instanceof Error ? e.message : String(e) })),
          );
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('me.account')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: space.m, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        <Paper style={{ alignItems: 'center', gap: space.s, paddingVertical: space.xl }}>
          <Avatar uri={account.imageUrl} name={account.name} email={account.email} size={84} />
          {account.signedIn ? (
            <>
              {account.name ? <Txt variant="headline">{account.name}</Txt> : null}
              <Txt variant="small" color="inkSoft">
                {account.email ?? t('unlock.signedIn')}
              </Txt>
              <Txt variant="small" color="inkSoft" center style={{ marginTop: space.xs }}>
                {plan}
              </Txt>
            </>
          ) : (
            <Txt variant="small" color="inkSoft" center>
              {t('me.accountWhy')}
            </Txt>
          )}
        </Paper>
        <Paper style={{ paddingVertical: space.xs }}>
          {account.signedIn ? (
            <>
              <LinkRow icon={LogOut} label={t('me.signOut')} onPress={() => void account.signOut().then(() => router.canGoBack() && router.back())} />
              <Divider />
              <LinkRow icon={Trash2} tone="red" label={t('me.deleteAccount')} detail={t('me.deleteAccountDetail')} onPress={confirmDelete} />
            </>
          ) : (
            <LinkRow icon={LogIn} tone="royal" label={t('me.accountSignIn')} onPress={() => router.push('/signin')} />
          )}
        </Paper>
        <Txt variant="caption" color="inkFaint" center>
          {t('signin.why')}
        </Txt>
      </ScrollView>
    </View>
  );
}
