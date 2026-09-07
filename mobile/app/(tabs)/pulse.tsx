import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '@/lib/api';
import type { Pulse, Entry } from '@/lib/types';
import { useCountdown } from '@/components/useCountdown';

type CaptureMode = 'text' | 'photo';
type SubmitState = 'idle' | 'submitting' | 'submitted';

export default function PulseScreen() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<CaptureMode>('text');
  const [text, setText] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [myEntry, setMyEntry] = useState<Entry | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  async function loadPulse() {
    try {
      const p = await api.pulses.active();
      setPulse(p);
    } catch {}
    finally { setLoading(false); }
  }

  useFocusEffect(useCallback(() => {
    loadPulse();
    setMyEntry(null);
    setSubmitState('idle');
    setText('');
    setCapturedPhoto(null);
  }, []));

  const countdown = useCountdown(
    pulse?.status === 'active' ? pulse.submission_ends_at : pulse?.voting_ends_at,
  );

  async function takePhoto() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (photo) setCapturedPhoto(photo.uri);
  }

  async function submit() {
    if (!pulse) return;
    setSubmitState('submitting');

    try {
      let entry: Entry;

      if (mode === 'text') {
        if (!text.trim()) { Alert.alert('Write something first.'); setSubmitState('idle'); return; }
        entry = await api.entries.submit({
          pulse_id: pulse.id,
          content_type: 'text',
          text_content: text.trim(),
        });
      } else {
        if (!capturedPhoto) { Alert.alert('Take a photo first.'); setSubmitState('idle'); return; }
        const { upload_url, media_key } = await api.media.presign('image/jpeg', pulse.id);
        await api.media.upload(upload_url, capturedPhoto, 'image/jpeg');
        entry = await api.entries.submit({
          pulse_id: pulse.id,
          content_type: 'photo',
          media_key,
        });
      }

      setMyEntry(entry);
      setSubmitState('submitted');
    } catch (err: any) {
      Alert.alert('Could not submit', err.message ?? 'Try again');
      setSubmitState('idle');
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>;
  }

  if (!pulse || pulse.status === 'resolved' || pulse.status === 'resolving') {
    return (
      <View style={styles.center}>
        <Text style={styles.noPulseIcon}>◉</Text>
        <Text style={styles.noPulseTitle}>No active Pulse</Text>
        <Text style={styles.noPulseText}>Stay ready. It can fire at any moment.</Text>
      </View>
    );
  }

  if (submitState === 'submitted' && myEntry) {
    return <SubmittedView entry={myEntry} pulse={pulse} countdown={countdown} />;
  }

  if (pulse.status === 'voting') {
    return (
      <View style={styles.center}>
        <Text style={styles.votingIcon}>🗳</Text>
        <Text style={styles.votingTitle}>Voting is open</Text>
        <Text style={styles.votingText}>Submission window is closed. Go vote!</Text>
        {countdown && <Text style={styles.votingCountdown}>{countdown} left</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <LinearGradient colors={['#ff4444', '#cc0000']} style={styles.topBar}>
        <Text style={styles.liveLabel}>⚡ PULSE IS LIVE</Text>
        {countdown && <Text style={styles.countdown}>{countdown}</Text>}
      </LinearGradient>

      {/* Prompt */}
      <View style={styles.promptContainer}>
        <Text style={styles.prompt}>"{pulse.prompt}"</Text>
      </View>

      {/* Mode selector */}
      <View style={styles.modeSelector}>
        <TouchableOpacity
          style={[styles.modeTab, mode === 'text' && styles.modeTabActive]}
          onPress={() => { setMode('text'); setCapturedPhoto(null); }}
        >
          <Text style={[styles.modeTabText, mode === 'text' && styles.modeTabTextActive]}>
            Text
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeTab, mode === 'photo' && styles.modeTabActive]}
          onPress={async () => {
            if (!cameraPermission?.granted) await requestCameraPermission();
            setMode('photo');
          }}
        >
          <Text style={[styles.modeTabText, mode === 'photo' && styles.modeTabTextActive]}>
            Photo
          </Text>
        </TouchableOpacity>
      </View>

      {/* Capture area */}
      <View style={styles.captureArea}>
        {mode === 'text' ? (
          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={t => setText(t.slice(0, 140))}
            placeholder="What do you see right now?"
            placeholderTextColor="#444"
            multiline
            maxLength={140}
            textAlignVertical="top"
            autoFocus
          />
        ) : capturedPhoto ? (
          <View style={styles.previewContainer}>
            <Image source={{ uri: capturedPhoto }} style={styles.preview} />
            <TouchableOpacity style={styles.retakeBtn} onPress={() => setCapturedPhoto(null)}>
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
          </View>
        ) : cameraPermission?.granted ? (
          <View style={styles.cameraContainer}>
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
            <TouchableOpacity style={styles.shutterBtn} onPress={takePhoto}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noPermission}>
            <Text style={styles.noPermissionText}>Camera permission required</Text>
            <TouchableOpacity onPress={requestCameraPermission}>
              <Text style={styles.permissionBtn}>Grant access</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Char count for text */}
      {mode === 'text' && (
        <Text style={styles.charCount}>{text.length}/140</Text>
      )}

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, submitState === 'submitting' && styles.submitBtnDisabled]}
        onPress={submit}
        disabled={submitState === 'submitting'}
      >
        {submitState === 'submitting' ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.submitBtnText}>Submit to the Pulse</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function SubmittedView({ entry, pulse, countdown }: { entry: Entry; pulse: Pulse; countdown: string | null }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.submittedContent}>
      <Text style={styles.submittedTitle}>You're in.</Text>
      <Text style={styles.submittedSub}>Voting opens when the submission window closes.</Text>
      {countdown && (
        <Text style={styles.submittedCountdown}>{countdown} remaining</Text>
      )}
      <View style={styles.myEntryCard}>
        <Text style={styles.myEntryLabel}>YOUR ENTRY</Text>
        {entry.text_content ? (
          <Text style={styles.myEntryText}>{entry.text_content}</Text>
        ) : entry.media_url ? (
          <Image source={{ uri: entry.media_url }} style={styles.myEntryImage} />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },

  topBar: { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveLabel: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 2 },
  countdown: { fontSize: 22, fontWeight: '900', color: '#fff', fontVariant: ['tabular-nums'] },

  promptContainer: { padding: 20, paddingTop: 24 },
  prompt: { fontSize: 26, fontWeight: '700', color: '#fff', lineHeight: 34 },

  modeSelector: { flexDirection: 'row', marginHorizontal: 20, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
  modeTab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  modeTabActive: { backgroundColor: '#fff' },
  modeTabText: { color: '#555', fontWeight: '600', fontSize: 14 },
  modeTabTextActive: { color: '#000' },

  captureArea: { flex: 1, margin: 20 },

  textInput: { flex: 1, backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#222', padding: 16, color: '#fff', fontSize: 18, lineHeight: 26 },

  cameraContainer: { flex: 1, position: 'relative', borderRadius: 12, overflow: 'hidden' },
  camera: { flex: 1 },
  shutterBtn: { position: 'absolute', bottom: 20, alignSelf: 'center', width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff' },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' },

  previewContainer: { flex: 1, position: 'relative', borderRadius: 12, overflow: 'hidden' },
  preview: { flex: 1 },
  retakeBtn: { position: 'absolute', bottom: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  retakeBtnText: { color: '#fff', fontWeight: '600' },

  noPermission: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  noPermissionText: { color: '#555', fontSize: 16 },
  permissionBtn: { color: '#fff', fontSize: 15, fontWeight: '700' },

  charCount: { textAlign: 'right', color: '#444', fontSize: 12, marginRight: 20, marginTop: -12 },

  submitBtn: { backgroundColor: '#fff', margin: 20, borderRadius: 12, paddingVertical: 18, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#000', fontSize: 16, fontWeight: '800', letterSpacing: 1 },

  submittedContent: { padding: 32, paddingTop: 80, gap: 16 },
  submittedTitle: { fontSize: 36, fontWeight: '900', color: '#fff' },
  submittedSub: { fontSize: 15, color: '#666', lineHeight: 22 },
  submittedCountdown: { fontSize: 13, color: '#ff4444', fontVariant: ['tabular-nums'] },
  myEntryCard: { backgroundColor: '#111', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#222', gap: 10, marginTop: 16 },
  myEntryLabel: { fontSize: 10, fontWeight: '700', color: '#555', letterSpacing: 3 },
  myEntryText: { fontSize: 18, color: '#fff', lineHeight: 26 },
  myEntryImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8 },

  noPulseIcon: { fontSize: 48, color: '#222' },
  noPulseTitle: { fontSize: 22, fontWeight: '700', color: '#444' },
  noPulseText: { fontSize: 15, color: '#333', textAlign: 'center' },

  votingIcon: { fontSize: 48 },
  votingTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  votingText: { fontSize: 15, color: '#666', textAlign: 'center' },
  votingCountdown: { fontSize: 13, color: '#ff8800', fontVariant: ['tabular-nums'], marginTop: 8 },
});
