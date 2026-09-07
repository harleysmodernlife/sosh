import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';

export default function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email || !password) return;
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        try {
          const user = await api.users.me();
          router.replace(user.username ? '/(tabs)/home' : '/onboarding');
        } catch {
          router.replace('/(tabs)/home');
        }
      } else {
        // Validate invite code before creating account
        const code = inviteCode.trim().toUpperCase();
        if (!code) {
          Alert.alert('Invite required', 'Enter your invite code to create an account.');
          return;
        }
        try {
          await api.invites.validate(code);
        } catch (err: any) {
          const msg = err.message ?? '';
          if (msg.includes('already used')) {
            Alert.alert('Code already used', 'This invite code has already been claimed.');
          } else if (msg.includes('expired')) {
            Alert.alert('Code expired', 'This invite code has expired. Ask for a new one.');
          } else {
            Alert.alert('Invalid code', 'That invite code isn\'t valid. Check it and try again.');
          }
          return;
        }

        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        // Redeem invite code, tied to the new user
        if (data.user) {
          try {
            await api.invites.redeem(code, data.user.id);
          } catch {
            // Non-fatal — account is created, just log and continue
          }
        }

        Alert.alert(
          'Check your email',
          'We sent a confirmation link. Once confirmed, sign back in.',
        );
        setMode('login');
        setInviteCode('');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.wordmark}>SÖSH</Text>
        <Text style={styles.tagline}>Something is happening right now.</Text>

        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]}
            onPress={() => setMode('login')}
          >
            <Text style={[styles.modeBtnText, mode === 'login' && styles.modeBtnTextActive]}>
              Sign in
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
            onPress={() => setMode('signup')}
          >
            <Text style={[styles.modeBtnText, mode === 'signup' && styles.modeBtnTextActive]}>
              Sign up
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'signup' && (
          <View style={styles.inviteGroup}>
            <TextInput
              style={[styles.input, styles.inviteInput]}
              placeholder="INVITE CODE"
              placeholderTextColor="#444"
              value={inviteCode}
              onChangeText={t => setInviteCode(t.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
            />
            <Text style={styles.inviteHint}>Sösh is invite-only. Need one? Ask a member.</Text>
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#555"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#555"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        />

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.submitBtnText}>
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  wordmark: {
    fontSize: 56,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 10,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    color: '#555',
    marginBottom: 32,
    letterSpacing: 0.3,
  },
  modeToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#fff',
  },
  modeBtnText: {
    color: '#444',
    fontWeight: '600',
    fontSize: 14,
  },
  modeBtnTextActive: {
    color: '#000',
  },
  inviteGroup: {
    gap: 6,
  },
  inviteInput: {
    letterSpacing: 4,
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 18,
  },
  inviteHint: {
    fontSize: 11,
    color: '#333',
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#0d0d0d',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: '#fff',
    fontSize: 16,
  },
  submitBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
