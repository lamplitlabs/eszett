// Sign in with an e-mail address and a code (no password): the only account thing in Eszett, and only for
// downloading the tutor model. A new address is signed up on the spot. Clerk's hooks live here and in the
// account bridge; this screen is reachable only in a build with a Clerk key.

import { useSignIn, useSignUp, useSSO } from '@clerk/clerk-expo';
import * as AuthSession from 'expo-auth-session';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/features/account';
import { useI18n } from '@/i18n';
import { useModel } from '@/model/runtime';
import { Button, IconButton, Paper } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { Txt } from '@/ui/Text';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

type Step = 'email' | 'code';
type Provider = 'oauth_google' | 'oauth_apple';

// the browser tab Clerk opens for Google / Apple comes back to the app through the scheme; this closes it
WebBrowser.maybeCompleteAuthSession();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Clerk's error list, as one line for the learner. */
function clerkMessage(e: unknown, fallback: string): string {
  const errors = (e as { errors?: { longMessage?: string; message?: string }[] })?.errors;
  const first = errors?.[0];
  return first?.longMessage ?? first?.message ?? (e instanceof Error ? e.message : fallback);
}

export default function SignInScreen() {
  const { then } = useLocalSearchParams<{ then?: 'download' }>();
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { signIn, setActive: setActiveIn, isLoaded: inLoaded } = useSignIn();
  const { signUp, setActive: setActiveUp, isLoaded: upLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();
  const refreshMe = useAccount((s) => s.refreshMe);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // which flow the code belongs to: an existing account signs in, a new address signs up
  const flow = useRef<'in' | 'up'>('in');
  const codeField = useRef<TextInput>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  useEffect(() => {
    // Android keeps the browser warm for the sign-in tab; a no-op elsewhere
    void WebBrowser.warmUpAsync();
    return () => void WebBrowser.coolDownAsync();
  }, []);

  const finish = () => {
    haptic.success();
    void refreshMe(true);
    if (then === 'download') {
      close();
      setTimeout(() => void useModel.getState().download(), 300);
    } else close();
  };

  /** Google or Apple: Clerk opens the provider in a browser tab and comes back with a session (and the photo and name on that account). */
  const withProvider = async (strategy: Provider) => {
    setBusy(true);
    setError('');
    try {
      const { createdSessionId, setActive, authSessionResult } = await startSSOFlow({ strategy, redirectUrl: AuthSession.makeRedirectUri({ scheme: 'eszett', path: 'sso' }) });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        finish();
      } else if (authSessionResult?.type !== 'cancel' && authSessionResult?.type !== 'dismiss') {
        // a provider account that still needs something (a missing e-mail, a second factor) is not something this app asks for
        setError(t('signin.errProvider'));
      }
    } catch (e) {
      setError(clerkMessage(e, t('signin.errProvider')));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address) || !inLoaded || !upLoaded || !signIn || !signUp) return;
    setBusy(true);
    setError('');
    try {
      try {
        const attempt = await signIn.create({ identifier: address });
        const factor = attempt.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
        if (!factor || !('emailAddressId' in factor)) throw new Error(t('signin.errNoEmailCode'));
        await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
        flow.current = 'in';
      } catch (e) {
        const code = (e as { errors?: { code?: string }[] })?.errors?.[0]?.code;
        if (code !== 'form_identifier_not_found') throw e;
        // no account yet: make one with this address
        await signUp.create({ emailAddress: address });
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        flow.current = 'up';
      }
      haptic.soft();
      setStep('code');
      setTimeout(() => codeField.current?.focus(), 250);
    } catch (e) {
      setError(clerkMessage(e, t('signin.errSend')));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const digits = code.replace(/\D/g, '');
    if (digits.length < 6 || !signIn || !signUp) return;
    setBusy(true);
    setError('');
    try {
      if (flow.current === 'in') {
        const result = await signIn.attemptFirstFactor({ strategy: 'email_code', code: digits });
        if (result.status !== 'complete' || !result.createdSessionId) throw new Error(t('signin.errCode'));
        await setActiveIn({ session: result.createdSessionId });
      } else {
        const result = await signUp.attemptEmailAddressVerification({ code: digits });
        if (result.status !== 'complete' || !result.createdSessionId) throw new Error(t('signin.errCode'));
        await setActiveUp({ session: result.createdSessionId });
      }
      finish();
    } catch (e) {
      setError(clerkMessage(e, t('signin.errCode')));
    } finally {
      setBusy(false);
    }
  };

  const fieldStyle = { fontFamily: font.sans, fontSize: 18, color: c.ink, backgroundColor: c.sheet, borderRadius: radius.control, borderWidth: 1.5, borderColor: c.rule, paddingHorizontal: space.l, paddingVertical: 14 } as const;

  return (
    <KeyboardAvoider style={{ flex: 1, backgroundColor: c.paper }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + space.s, paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <IconButton icon={ArrowLeft} label={t('common.back')} tone="sheet" size={38} onPress={step === 'code' ? () => setStep('email') : close} />
          <Txt variant="title" style={{ flex: 1 }} accessibilityRole="header">
            {t('signin.title')}
          </Txt>
        </View>

        <Paper tone="royal" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.m }}>
          <ShieldCheck size={20} color={c.royal} style={{ marginTop: 2 }} />
          <Txt variant="small" style={{ flex: 1 }}>
            {t('signin.why')}
          </Txt>
        </Paper>

        {step === 'email' ? (
          <View style={{ gap: space.m }}>
            <Button label={t('signin.withGoogle')} kind="secondary" disabled={busy} onPress={() => void withProvider('oauth_google')} />
            {Platform.OS === 'ios' ? <Button label={t('signin.withApple')} kind="secondary" disabled={busy} onPress={() => void withProvider('oauth_apple')} /> : null}
            <Txt variant="caption" color="inkFaint" center style={{ marginVertical: space.xs }}>
              {t('signin.orEmail')}
            </Txt>
            <Txt variant="smallStrong" color="inkSoft">
              {t('signin.email')}
            </Txt>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="name@example.com"
              placeholderTextColor={c.inkFaint}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={() => void sendCode()}
              accessibilityLabel={t('signin.email')}
              style={fieldStyle}
            />
            <Button label={t('signin.sendCode')} icon={Mail} loading={busy} disabled={!EMAIL.test(email.trim()) || busy} onPress={() => void sendCode()} />
          </View>
        ) : (
          <View style={{ gap: space.m }}>
            <Txt variant="body" color="inkSoft">
              {t('signin.codeSent', { email: email.trim() })}
            </Txt>
            <TextInput
              ref={codeField}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              placeholderTextColor={c.inkFaint}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              returnKeyType="done"
              onSubmitEditing={() => void verify()}
              accessibilityLabel={t('signin.code')}
              style={{ ...fieldStyle, fontSize: 28, letterSpacing: 8, textAlign: 'center', fontVariant: ['tabular-nums'] }}
            />
            <Button label={t('signin.verify')} loading={busy} disabled={code.length < 6 || busy} onPress={() => void verify()} />
            <Button label={t('signin.resend')} kind="quiet" size="medium" disabled={busy} onPress={() => void sendCode()} />
          </View>
        )}

        {error ? (
          <Txt variant="small" center style={{ color: c.red }}>
            {error}
          </Txt>
        ) : null}

        <Txt variant="caption" color="inkFaint" center>
          {t('signin.privacy')}
        </Txt>
      </ScrollView>
    </KeyboardAvoider>
  );
}
