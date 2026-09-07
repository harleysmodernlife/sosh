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
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';

export default function OnboardingScreen() {
  const [username, setUsername] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);

  const usernameValid = /^[a-zA-Z0-9_]{3,30}$/.test(username);

  async function handleFinish() {
    if (!usernameValid) {
      Alert.alert('Invalid username', 'Use 3–30 characters: letters, numbers, underscores only.');
      return;
    }
    if (!city.trim()) {
      Alert.alert('City required', 'Enter your city so you can compete on the local leaderboard.');
      return;
    }
    setLoading(true);
    try {
      await api.users.update({ username: username.trim(), city: city.trim() });
      router.replace('/(tabs)/home');
    } catch (err: any) {
      const msg = err.message ?? 'Something went wrong';
      if (msg.toLowerCase().includes('taken')) {
        Alert.alert('Username taken', 'That username is already in use. Try another.');
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.wordmark}>SÖSH</Text>
        <Text style={styles.heading}>Set up your profile</Text>
        <Text style={styles.subheading}>
          Your username and city are your leaderboard identity. Choose them well — they're permanent.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>USERNAME</Text>
          <TextInput
            style={[styles.input, username.length > 0 && !usernameValid && styles.inputError]}
            placeholder="e.g. captain_sosh"
            placeholderTextColor="#555"
            value={username}
            onChangeText={t => setUsername(t.replace(/\s/g, ''))}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
          />
          {username.length > 0 && !usernameValid && (
            <Text style={styles.hint}>3–30 chars, letters/numbers/underscores only</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>CITY</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Nashville"
            placeholderTextColor="#555"
            value={city}
            onChangeText={setCity}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={100}
          />
          <Text style={styles.hint}>Enter the city you're competing in</Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, (!usernameValid || !city.trim() || loading) && styles.btnDisabled]}
          onPress={handleFinish}
          disabled={!usernameValid || !city.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.btnText}>Let's go →</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 60, gap: 20 },

  wordmark: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: 8, marginBottom: 4 },
  heading: { fontSize: 26, fontWeight: '800', color: '#fff' },
  subheading: { fontSize: 14, color: '#555', lineHeight: 21, marginBottom: 8 },

  field: { gap: 7 },
  label: { fontSize: 10, fontWeight: '700', color: '#555', letterSpacing: 3 },
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
  inputError: { borderColor: '#ff4444' },
  hint: { fontSize: 12, color: '#444' },

  btn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.35 },
  btnText: { color: '#000', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
});
