import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Backdrop } from '@/components/Backdrop';
import { signIn } from '@/lib/api';
import { C, F } from '@/theme';

/** Sign in to the phone server on the PC (same account as agentic.norrita.com). */
export function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = email.includes('@') && password.length > 0 && !busy;

  async function submit() {
    if (!ready) return;
    setBusy(true); setError(null);
    try { await signIn(email, password); onDone(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.screen}>
      <Backdrop />
      <View style={s.form}>
        <Text style={s.title}>Sign in to your PC</Text>
        <Text style={s.body}>{Platform.OS === 'web'
          ? 'Your Agentic OS account. Today reads and writes your real agentos tasks.'
          : 'Same account as agentic.norrita.com. Today reads and writes your real agentos tasks.'}</Text>
        <View style={s.field}>
          <Text style={s.label}>Email</Text>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address"
            textContentType="username" style={s.input} placeholderTextColor={C.faint} returnKeyType="next" />
        </View>
        <View style={s.field}>
          <Text style={s.label}>Password</Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password"
            style={s.input} placeholderTextColor={C.faint} returnKeyType="go" onSubmitEditing={submit} />
        </View>
        {error ? <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={submit} disabled={!ready}
          style={({ pressed }) => [s.button, !ready && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.98 }] }]}>
          {busy ? <ActivityIndicator color={C.scene} /> : <Text style={s.buttonText}>Sign in</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.scene, justifyContent: 'center', paddingHorizontal: 24 },
  form: { gap: 16, width: '100%', maxWidth: 400, alignSelf: 'center' }, // a card in the middle of a desktop window
  title: { fontFamily: F.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: C.text },
  body: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted },
  field: { gap: 8 },
  label: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
  input: { height: 48, borderRadius: 12, backgroundColor: C.raised, paddingHorizontal: 16, color: C.text, fontFamily: F.regular, fontSize: 16 },
  error: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.danger },
  button: { height: 48, borderRadius: 24, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { fontFamily: F.semibold, fontSize: 16, color: C.scene },
});
