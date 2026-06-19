import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { apiLogin, apiRegister } from '../net/socket';

const ERRORS: Record<string, string> = {
  email_taken: 'That email is already registered — try signing in.',
  bad_credentials: 'Wrong email or password.',
  network: 'Could not reach the server. Try again.',
};

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const register = mode === 'register';
  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= 6 && (!register || name.trim().length >= 2);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    const res = register ? await apiRegister(email.trim(), password, name.trim()) : await apiLogin(email.trim(), password);
    setBusy(false);
    if (!res.ok) setErr(ERRORS[res.error ?? ''] ?? 'Something went wrong.');
    // On success the store gets the token+account and the app advances automatically.
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>TERRITORIAL</Text>
      <Text style={styles.subtitle}>Sign in to play, wager coins, and climb the ranks.</Text>

      <View style={styles.tabs}>
        {(['login', 'register'] as const).map((m) => (
          <Pressable key={m} onPress={() => { setMode(m); setErr(null); }}
            style={[styles.tab, mode === m && styles.tabActive]}>
            <Text style={[styles.tabTxt, mode === m && { color: '#fff' }]}>{m === 'login' ? 'Sign in' : 'Create account'}</Text>
          </Pressable>
        ))}
      </View>

      <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email"
        placeholderTextColor="#667" autoCapitalize="none" keyboardType="email-address" inputMode="email" />
      {register && (
        <TextInput style={styles.input} value={name} onChangeText={(t) => setName(t.slice(0, 24))}
          placeholder="Display name" placeholderTextColor="#667" maxLength={24} />
      )}
      <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password (min 6)"
        placeholderTextColor="#667" secureTextEntry onSubmitEditing={submit} />

      {err && <Text style={styles.err}>⚠ {err}</Text>}

      <Pressable style={[styles.btn, (!valid || busy) && styles.btnDisabled]} onPress={submit} disabled={!valid || busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>{register ? 'Create account' : 'Sign in'}</Text>}
      </Pressable>

      <Text style={styles.note}>New accounts start with 🪙 1000 coins. {register ? 'Already have one? Tap “Sign in”.' : 'No account? Tap “Create account”.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d12', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 52, fontWeight: '900', letterSpacing: 4 },
  subtitle: { color: '#9aa', fontSize: 15, marginTop: 8, marginBottom: 26, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  tab: { paddingVertical: 9, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#222838', borderWidth: 1, borderColor: '#2a3145' },
  tabActive: { backgroundColor: '#2f6df0', borderColor: '#2f6df0' },
  tabTxt: { color: '#9fb0cf', fontSize: 14, fontWeight: '800' },
  input: {
    width: 300, color: '#fff', fontSize: 16, fontWeight: '600',
    backgroundColor: '#222838', borderWidth: 1, borderColor: '#2a3145', borderRadius: 10,
    paddingVertical: 11, paddingHorizontal: 14, marginBottom: 12,
  },
  err: { color: '#ff9f8f', fontSize: 13, fontWeight: '700', marginBottom: 10, maxWidth: 300, textAlign: 'center' },
  btn: { backgroundColor: '#4c7dff', paddingVertical: 13, paddingHorizontal: 44, borderRadius: 13, marginTop: 4, minWidth: 200, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  note: { color: '#667', fontSize: 13, marginTop: 22, maxWidth: 320, textAlign: 'center', lineHeight: 19 },
});
