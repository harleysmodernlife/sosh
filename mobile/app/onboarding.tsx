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
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';

const { width: W } = Dimensions.get('window');

const INTRO_SLIDES = [
  {
    icon: '⚡',
    title: 'The Pulse',
    body: 'Without warning, a prompt fires globally. You have minutes to respond — text, photo, or video. One winner per city gets City Rep.',
  },
  {
    icon: '▲',
    title: 'Vote',
    body: 'When submission closes, voting opens. Back the best responses. The community decides who wins.',
  },
  {
    icon: '◉',
    title: 'The Feed',
    body: 'Browse posts from the community anytime. Like, comment, follow people whose vibe matches yours.',
  },
  {
    icon: '🏆',
    title: 'Sösh Score',
    body: 'Every trophy, entry, vote received, and vote cast builds your score. Win pulses. Rise on the board.',
  },
];

export default function OnboardingScreen() {
  const [slide, setSlide] = useState(0);
  const [username, setUsername] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);

  const usernameValid = /^[a-zA-Z0-9_]{3,30}$/.test(username);
  const onForm = slide >= INTRO_SLIDES.length;

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

  if (!onForm) {
    const s = INTRO_SLIDES[slide];
    return (
      <View style={styles.container}>
        <View style={styles.slideWrap}>
          <Text style={styles.wordmark}>SÖSH</Text>
          <Text style={styles.slideIcon}>{s.icon}</Text>
          <Text style={styles.slideTitle}>{s.title}</Text>
          <Text style={styles.slideBody}>{s.body}</Text>
        </View>
        <View style={styles.slideNav}>
          <View style={styles.dots}>
            {INTRO_SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === slide && styles.dotActive]} />
            ))}
          </View>
          <TouchableOpacity style={styles.nextBtn} onPress={() => setSlide(s => s + 1)}>
            <Text style={styles.nextBtnText}>
              {slide === INTRO_SLIDES.length - 1 ? 'Set up profile →' : 'Next →'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
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
          Your username and city are your leaderboard identity.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>USERNAME</Text>
          <TextInput
            style={[styles.input, username.length > 0 && !usernameValid && styles.inputError]}
            placeholder="e.g. captain_sosh"
            placeholderTextColor="#555"
            value={username}
            onChangeText={t => setUsername(t.replace(/\s/g, '').slice(0, 30))}
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
          <Text style={styles.hint}>Your city leaderboard — this determines your Pulse competition</Text>
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

  // Intro slides
  slideWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 20 },
  wordmark: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: 8 },
  slideIcon: { fontSize: 64, marginTop: 8 },
  slideTitle: { fontSize: 28, fontWeight: '900', color: '#fff', textAlign: 'center' },
  slideBody: { fontSize: 16, color: '#666', lineHeight: 24, textAlign: 'center' },
  slideNav: { paddingHorizontal: 32, paddingBottom: 56, gap: 20, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#222' },
  dotActive: { backgroundColor: '#fff', width: 18 },
  nextBtn: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 36, paddingVertical: 16, alignSelf: 'stretch', alignItems: 'center' },
  nextBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },

  // Profile form
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 60, gap: 20 },
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
