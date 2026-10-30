// The Full-access sheet: where the learner stands (the free week, its end, or paid), what the one-time purchase
// is, and the two store actions (buy, restore). The rules live in src/features/accessRules.ts, the store calls in
// src/features/purchases.ts; this file only words them. In development a row of pills moves the week around so
// every state can be seen without waiting seven days or paying.
import { router } from 'expo-router';
import { Check, Gift, HeartHandshake, KeyRound, LogIn, MessageCircle, ShieldCheck, Sparkles, Ticket, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';

import { PRODUCT_ID, simulateTrialEnded, useAccess, useAccessView } from '@/features/access';
import { useAccount } from '@/features/account';
import { ApiError, redeemCode } from '@/features/api';
import { FRESH_ID, GIFT_ID, usePurchases } from '@/features/purchases';
import { useModel } from '@/model/runtime';
import { useI18n } from '@/i18n';
import { Button, IconButton, Paper, Pill } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { Txt } from '@/ui/Text';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

const STORE_NAME = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

export default function UnlockScreen() {
  const { c } = useTheme();
  const { t } = useI18n();
  const access = useAccessView();
  const store = usePurchases();
  const account = useAccount();
  const me = account.me;
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState<'code' | 'pool' | null>(null);
  const [codeNote, setCodeNote] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  // a code, typed or from the pay-it-forward pool: the server grants full access to the account
  const redeem = async (fromPool: boolean) => {
    if (!account.enabled) return;
    if (!account.signedIn) {
      router.push('/signin');
      return;
    }
    setCodeBusy(fromPool ? 'pool' : 'code');
    setCodeNote(null);
    try {
      const token = await account.getToken();
      if (!token) throw new Error(t('signin.errSession'));
      const result = await redeemCode(fromPool ? null : code, token);
      useAccount.setState({ me: result, meAt: Date.now() });
      // the account now has full access; the phone's own record follows so the app unlocks at once
      useAccess.getState().setPurchase({ productId: PRODUCT_ID, transactionId: `code:${result.code}`, purchasedAt: Date.now(), store: 'code' });
      haptic.success();
      setCode('');
      setCodeNote({ tone: 'green', text: fromPool ? t('unlock.poolGranted') : t('unlock.codeGranted') });
      // a download the server refused a moment ago can go ahead now
      if (useModel.getState().gate?.kind === 'entitlement') void useModel.getState().download();
    } catch (e) {
      const api = e instanceof ApiError ? e : null;
      const text =
        api?.code === 'pool-empty'
          ? t('unlock.poolEmpty')
          : api?.code === 'unknown-code'
            ? t('unlock.codeUnknown')
            : api?.code === 'code-used'
              ? t('unlock.codeUsed')
              : api?.code === 'already-full'
                ? t('unlock.codeAlready')
                : t('unlock.errFailed', { reason: e instanceof Error ? e.message : String(e) });
      setCodeNote({ tone: 'red', text });
    } finally {
      setCodeBusy(null);
    }
  };

  // a fresh clock reading for the days left, and the store's price if it has not been fetched yet
  useEffect(() => {
    useAccess.getState().touch();
    void usePurchases.getState().connect();
    return () => usePurchases.getState().settle();
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const paid = access.kind === 'paid';
  const canBuy = store.status === 'ready' && store.price !== null && store.busy === null;
  const buyLabel = store.status === 'ready' && store.price ? t('unlock.buy', { price: store.price }) : store.status === 'unavailable' ? t('unlock.buyUnavailable') : t('unlock.buyPending');
  const noteText = store.note === 'pending' ? t('unlock.pending') : store.note === 'restored' ? t('unlock.restored') : store.note === 'restoreNone' ? t('unlock.restoreNone') : null;

  const bullets: [typeof Sparkles, string][] = [
    [MessageCircle, t('unlock.bullet1')],
    [Sparkles, t('unlock.bullet2')],
    [ShieldCheck, t('unlock.bullet3')],
  ];

  return (
    <SafeAreaView edges={{ top: true }} style={{ flex: 1, backgroundColor: c.sheet }}>
      <ScrollView style={{ flex: 1, backgroundColor: c.sheet }} contentContainerStyle={{ padding: gutter, paddingTop: space.x3, gap: space.l }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <Txt variant="title" style={{ flex: 1 }} accessibilityRole="header">
            {t('unlock.title')}
          </Txt>
          <IconButton icon={X} label={t('common.close')} tone="sheet" size={34} onPress={close} />
        </View>

        <Paper tone={paid ? 'green' : access.kind === 'ended' ? 'amber' : 'alt'} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          {paid ? <Check size={20} color={c.green} strokeWidth={2.4} /> : <KeyRound size={20} color={access.kind === 'ended' ? c.amberInk : c.royal} />}
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="bodyStrong">{paid ? t('unlock.paid') : access.kind === 'ended' ? t('unlock.trialEnded') : t('unlock.trialLeft', { count: access.daysLeft })}</Txt>
            <Txt variant="small" color="inkSoft">
              {paid ? t('unlock.paidDetail') : access.kind === 'ended' ? t('unlock.trialEndedDetail') : t('unlock.trialDetail')}
            </Txt>
          </View>
        </Paper>

        {account.enabled ? (
          <Paper tone="alt" style={{ gap: space.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
              <LogIn size={18} color={c.inkSoft} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{account.signedIn ? (account.email ?? t('unlock.signedIn')) : t('unlock.notSignedIn')}</Txt>
                <Txt variant="small" color="inkSoft">
                  {account.signedIn
                    ? me?.plan === 'full'
                      ? me.updatesLeftDays > 0
                        ? t('unlock.updatesLeft', { count: me.updatesLeftDays })
                        : t('unlock.updatesOver')
                      : t('unlock.accountFree')
                    : t('unlock.notSignedInDetail')}
                </Txt>
              </View>
              {!account.signedIn ? <Button label={t('signin.open')} size="small" kind="secondary" onPress={() => router.push('/signin')} /> : null}
            </View>
          </Paper>
        ) : null}

        <View style={{ gap: space.m }}>
          <Txt variant="body">{t('unlock.pitch')}</Txt>
          <View style={{ gap: space.s }}>
            {bullets.map(([Icon, text]) => (
              <View key={text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.m }}>
                <Icon size={18} color={c.royal} style={{ marginTop: 2 }} />
                <Txt variant="small" style={{ flex: 1 }}>
                  {text}
                </Txt>
              </View>
            ))}
          </View>
        </View>

        {paid ? null : (
          <View style={{ gap: space.s }}>
            <Button label={buyLabel} icon={KeyRound} loading={store.busy === 'buy'} disabled={!canBuy && store.busy !== 'buy'} onPress={() => void store.buy()} accessibilityHint={t('unlock.buyHint')} />
            <Button label={store.busy === 'restore' ? t('unlock.restoring') : t('unlock.restore')} kind="quiet" size="medium" loading={store.busy === 'restore'} disabled={store.busy !== null || store.status === 'unavailable'} onPress={() => void store.restore()} />
            {store.status === 'unavailable' ? (
              <Txt variant="small" color="inkSoft" center>
                {t('unlock.errUnavailable')}
              </Txt>
            ) : null}
            {noteText ? (
              <Txt variant="small" color="inkSoft" center>
                {noteText}
              </Txt>
            ) : null}
            {store.error ? (
              <Txt variant="small" center style={{ color: c.red }}>
                {store.error}
              </Txt>
            ) : null}
          </View>
        )}

        {account.enabled ? (
          <View style={{ gap: space.l }}>
            {!paid ? (
              <Paper style={{ gap: space.m }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                  <Ticket size={18} color={c.royal} />
                  <Txt variant="bodyStrong" style={{ flex: 1 }}>
                    {t('unlock.codeTitle')}
                  </Txt>
                </View>
                <Txt variant="small" color="inkSoft">
                  {t('unlock.codeDetail')}
                </Txt>
                <View style={{ flexDirection: 'row', gap: space.s }}>
                  <TextInput
                    value={code}
                    onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9))}
                    placeholder="K7RT-M3PQ"
                    placeholderTextColor={c.inkFaint}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={() => void redeem(false)}
                    accessibilityLabel={t('unlock.codeTitle')}
                    style={{ flex: 1, fontFamily: font.sans, fontSize: 18, letterSpacing: 2, color: c.ink, backgroundColor: c.sheet, borderRadius: radius.control, borderWidth: 1.5, borderColor: c.rule, paddingHorizontal: space.l, paddingVertical: 12 }}
                  />
                  <Button label={t('unlock.codeRedeem')} size="medium" loading={codeBusy === 'code'} disabled={code.replace(/-/g, '').length < 8 || codeBusy !== null} onPress={() => void redeem(false)} />
                </View>
                <View style={{ height: 1, backgroundColor: c.rule }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                  <HeartHandshake size={18} color={c.green} />
                  <Txt variant="bodyStrong" style={{ flex: 1 }}>
                    {t('unlock.poolTitle')}
                  </Txt>
                </View>
                <Txt variant="small" color="inkSoft">
                  {t('unlock.poolDetail')}
                </Txt>
                <Button label={t('unlock.poolAsk')} kind="secondary" size="medium" loading={codeBusy === 'pool'} disabled={codeBusy !== null} onPress={() => void redeem(true)} />
                {codeNote ? (
                  <Txt variant="small" center style={{ color: codeNote.tone === 'green' ? c.green : c.red }}>
                    {codeNote.text}
                  </Txt>
                ) : null}
              </Paper>
            ) : null}

            {store.prices[GIFT_ID] || (paid && store.prices[FRESH_ID]) ? (
              <Paper tone="alt" style={{ gap: space.m }}>
                {store.prices[GIFT_ID] ? (
                  <View style={{ gap: space.s }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                      <Gift size={18} color={c.amberInk} />
                      <Txt variant="bodyStrong" style={{ flex: 1 }}>
                        {t('unlock.giftTitle')}
                      </Txt>
                    </View>
                    <Txt variant="small" color="inkSoft">
                      {t('unlock.giftDetail')}
                    </Txt>
                    <Button label={t('unlock.giftBuy', { price: store.prices[GIFT_ID] })} kind="secondary" size="medium" loading={store.busy === 'buy'} disabled={store.busy !== null || !account.signedIn} onPress={() => void store.buy(GIFT_ID)} />
                    {store.gift ? (
                      <Paper tone="green" style={{ gap: 2 }}>
                        <Txt variant="small" style={{ color: c.green }}>
                          {t('unlock.giftCode')}
                        </Txt>
                        <Txt variant="title" style={{ letterSpacing: 2 }} selectable>
                          {store.gift}
                        </Txt>
                        <Txt variant="caption" color="inkSoft">
                          {t('unlock.giftShare')}
                        </Txt>
                      </Paper>
                    ) : null}
                  </View>
                ) : null}
                {paid && store.prices[FRESH_ID] ? (
                  <View style={{ gap: space.s }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                      <Sparkles size={18} color={c.royal} />
                      <Txt variant="bodyStrong" style={{ flex: 1 }}>
                        {t('unlock.freshTitle')}
                      </Txt>
                    </View>
                    <Txt variant="small" color="inkSoft">
                      {t('unlock.freshDetail')}
                    </Txt>
                    <Button label={t('unlock.freshBuy', { price: store.prices[FRESH_ID] })} kind="secondary" size="medium" loading={store.busy === 'buy'} disabled={store.busy !== null || !account.signedIn} onPress={() => void store.buy(FRESH_ID)} />
                  </View>
                ) : null}
              </Paper>
            ) : null}
          </View>
        ) : null}

        <Txt variant="caption" color="inkFaint" center>
          {t('unlock.legal', { store: STORE_NAME })}
        </Txt>

        {__DEV__ ? (
          <View style={{ gap: space.s, marginTop: space.m }}>
            <Txt variant="caption" color="inkFaint">
              Development · {PRODUCT_ID}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              <Pill label="End the week" tone="amber" onPress={() => simulateTrialEnded()} />
              <Pill label="Week from now" onPress={() => useAccess.getState().setTrialStartedAt(Date.now())} />
              <Pill label="Mark paid" tone="green" onPress={() => useAccess.getState().setPurchase({ productId: PRODUCT_ID, transactionId: 'dev', purchasedAt: Date.now(), store: 'dev' })} />
              <Pill label="Clear purchase" tone="red" onPress={() => useAccess.getState().setPurchase(null)} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
