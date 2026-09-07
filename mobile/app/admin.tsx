import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import type { Pulse } from '@/lib/types';

export default function AdminScreen() {
  const [activePulse, setActivePulse] = useState<Pulse | null>(null);
  const [loadingPulse, setLoadingPulse] = useState(true);

  const [prompt, setPrompt] = useState('');
  const [city, setCity] = useState('');
  const [submissionMins, setSubmissionMins] = useState('15');
  const [votingHours, setVotingHours] = useState('2');
  const [firing, setFiring] = useState(false);
  const [resolving, setResolving] = useState(false);

  const loadActive = useCallback(async () => {
    setLoadingPulse(true);
    try {
      const p = await api.pulses.active();
      setActivePulse(p);
    } catch {
      setActivePulse(null);
    } finally {
      setLoadingPulse(false);
    }
  }, []);

  useEffect(() => { loadActive(); }, [loadActive]);

  async function handleFire() {
    if (!prompt.trim()) {
      Alert.alert('Prompt required', 'Enter a prompt for the Pulse.');
      return;
    }
    const mins = parseInt(submissionMins, 10);
    const hours = parseInt(votingHours, 10);
    if (isNaN(mins) || mins < 5 || mins > 60) {
      Alert.alert('Invalid window', 'Submission window must be 5–60 minutes.');
      return;
    }
    if (isNaN(hours) || hours < 1 || hours > 24) {
      Alert.alert('Invalid window', 'Voting window must be 1–24 hours.');
      return;
    }
    setFiring(true);
    try {
      const fired = await api.admin.firePulse({
        prompt: prompt.trim(),
        submission_window_minutes: mins,
        voting_window_hours: hours,
        city: city.trim() || undefined,
      });
      setPrompt('');
      setCity('');
      Alert.alert('Pulse fired', `"${fired.prompt}"\n\nSubmissions close in ${mins}m, voting ends ${hours}h later.`);
      await loadActive();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to fire Pulse');
    } finally {
      setFiring(false);
    }
  }

  async function handleResolve() {
    if (!activePulse) return;
    Alert.alert(
      'Resolve now?',
      `This will immediately end "${activePulse.prompt}" and calculate the winner.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          style: 'destructive',
          onPress: async () => {
            setResolving(true);
            try {
              await api.admin.resolvePulse(activePulse.id);
              Alert.alert('Done', 'Resolution job enqueued. Check home tab in a moment.');
              await loadActive();
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Failed to resolve');
            } finally {
              setResolving(false);
            }
          },
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Admin Panel</Text>
        </View>

        {/* Active Pulse */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACTIVE PULSE</Text>
          {loadingPulse ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 16 }} />
          ) : activePulse ? (
            <View style={styles.activePulseCard}>
              <Text style={styles.activePulseStatus}>
                {activePulse.status.toUpperCase()}
                {activePulse.city ? `  ·  ${activePulse.city}` : ''}
              </Text>
              <Text style={styles.activePulsePrompt}>"{activePulse.prompt}"</Text>
              <TouchableOpacity
                style={[styles.resolveBtn, resolving && styles.btnDisabled]}
                onPress={handleResolve}
                disabled={resolving}
              >
                {resolving ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.resolveBtnText}>Resolve Now</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No active Pulse</Text>
            </View>
          )}
        </View>

        {/* Fire new Pulse */}
        {!activePulse && !loadingPulse && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>FIRE A PULSE</Text>

            <View style={styles.field}>
              <Text style={styles.label}>PROMPT</Text>
              <TextInput
                style={styles.promptInput}
                placeholder="What's everyone doing right now?"
                placeholderTextColor="#444"
                value={prompt}
                onChangeText={setPrompt}
                multiline
                maxLength={200}
              />
              <Text style={styles.charCount}>{prompt.length}/200</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>CITY (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Nashville"
                placeholderTextColor="#444"
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
                maxLength={100}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>SUBMISSION (min)</Text>
                <TextInput
                  style={styles.input}
                  value={submissionMins}
                  onChangeText={setSubmissionMins}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>VOTING (hrs)</Text>
                <TextInput
                  style={styles.input}
                  value={votingHours}
                  onChangeText={setVotingHours}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.fireBtn, (!prompt.trim() || firing) && styles.btnDisabled]}
              onPress={handleFire}
              disabled={!prompt.trim() || firing}
            >
              {firing ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.fireBtnText}>Fire Pulse</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingTop: 60, gap: 32, paddingBottom: 48 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 },
  back: { color: '#555', fontSize: 15 },
  title: { fontSize: 20, fontWeight: '800', color: '#fff' },

  section: { gap: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#555', letterSpacing: 3 },

  activePulseCard: {
    backgroundColor: '#0f0f0f',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222',
    padding: 18,
    gap: 10,
  },
  activePulseStatus: { fontSize: 11, fontWeight: '700', color: '#ff4444', letterSpacing: 2 },
  activePulsePrompt: { fontSize: 18, fontWeight: '700', color: '#fff', lineHeight: 24 },

  resolveBtn: {
    backgroundColor: '#ff4444',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  resolveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  emptyCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    padding: 20,
    alignItems: 'center',
  },
  emptyText: { color: '#333', fontSize: 14 },

  field: { gap: 6 },
  label: { fontSize: 10, fontWeight: '700', color: '#555', letterSpacing: 3 },
  input: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
  },
  promptInput: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, color: '#333', textAlign: 'right' },

  row: { flexDirection: 'row', gap: 12 },

  fireBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  fireBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.35 },
});
