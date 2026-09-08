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
import { useFocusEffect, router } from 'expo-router';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Pulse, Entry, ResolvedPulse } from '@/lib/types';
import { useCountdown } from '@/components/useCountdown';

type CaptureMode = 'text' | 'photo' | 'video';
type SubmitState = 'idle' | 'submitting' | 'submitted';

const MAX_VIDEO_SECONDS = 30;

export default function PulseScreen() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<CaptureMode>('text');
  const [text, setText] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedVideo, setCapturedVideo] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [myEntry, setMyEntry] = useState<Entry | null>(null);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [lastResolved, setLastResolved] = useState<ResolvedPulse | null>(null);
  const [lastEntries, setLastEntries] = useState<Entry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const countPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadPulse() {
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setCurrentUserId(uid);

      const p = await api.pulses.active();
      setPulse(p);
      if (p && p.status === 'active') {
        const ents = await api.pulses.entries(p.id);
        setEntryCount(ents.length);
      } else {
        setEntryCount(null);
        // Load last resolved for stats card
        const resolved = await api.pulses.resolved();
        if (resolved.length > 0) {
          setLastResolved(resolved[0]);
          const ents = await api.pulses.entries(resolved[0].id);
          setLastEntries(ents.sort((a, b) => b.vote_count - a.vote_count));
        }
      }
    } catch {}
    finally { setLoading(false); }
  }

  useFocusEffect(useCallback(() => {
    loadPulse();
    setMyEntry(null);
    setSubmitState('idle');
    setText('');
    setCapturedPhoto(null);
    setCapturedVideo(null);
    setIsRecording(false);
    setRecordingSeconds(0);

    countPollRef.current = setInterval(async () => {
      try {
        const p = await api.pulses.active();
        if (p && p.status === 'active') {
          const ents = await api.pulses.entries(p.id);
          setEntryCount(ents.length);
        }
      } catch {}
    }, 30000);

    return () => {
      if (countPollRef.current) clearInterval(countPollRef.current);
    };
  }, []));

  const countdown = useCountdown(
    pulse?.status === 'active' ? pulse.submission_ends_at : pulse?.voting_ends_at,
  );

  async function takePhoto() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (photo) setCapturedPhoto(photo.uri);
  }

  async function startRecording() {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true);
    setRecordingSeconds(0);

    recordingTimer.current = setInterval(() => {
      setRecordingSeconds(s => {
        if (s + 1 >= MAX_VIDEO_SECONDS) {
          stopRecording();
        }
        return s + 1;
      });
    }, 1000);

    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: MAX_VIDEO_SECONDS });
      if (video) setCapturedVideo(video.uri);
    } catch {}
  }

  function stopRecording() {
    if (!cameraRef.current || !isRecording) return;
    cameraRef.current.stopRecording();
    setIsRecording(false);
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
      recordingTimer.current = null;
    }
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
      } else if (mode === 'photo') {
        if (!capturedPhoto) { Alert.alert('Take a photo first.'); setSubmitState('idle'); return; }
        const { upload_url, media_key } = await api.media.presign('image/jpeg', pulse.id);
        await api.media.upload(upload_url, capturedPhoto, 'image/jpeg');
        entry = await api.entries.submit({
          pulse_id: pulse.id,
          content_type: 'photo',
          media_key,
        });
      } else {
        if (!capturedVideo) { Alert.alert('Record a video first.'); setSubmitState('idle'); return; }
        const { upload_url, media_key } = await api.media.presign('video/mp4', pulse.id);
        await api.media.upload(upload_url, capturedVideo, 'video/mp4');
        entry = await api.entries.submit({
          pulse_id: pulse.id,
          content_type: 'video',
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
    if (lastResolved) {
      const myLastEntry = currentUserId ? lastEntries.find(e => e.user_id === currentUserId) : null;
      const myLastRank = myLastEntry
        ? lastEntries.findIndex(e => e.id === myLastEntry.id) + 1
        : null;
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.statsContent}>
          <Text style={styles.statsWaiting}>Signal quiet.</Text>
          <Text style={styles.statsWaitingSub}>The Pulse fires without warning.{'\n'}This is the tab to be on when it does.</Text>
          <View style={styles.statsCard}>
            <Text style={styles.statsCardLabel}>LAST PULSE</Text>
            <Text style={styles.statsCardPrompt}>"{lastResolved.prompt}"</Text>
            {lastResolved.winner_username && (
              <View style={styles.statsWinner}>
                <Text style={styles.statsWinnerLabel}>WINNER</Text>
                <Text style={styles.statsWinnerName}>
                  {lastResolved.winner_display_name ?? `@${lastResolved.winner_username}`}
                </Text>
                {lastResolved.winner_votes != null && (
                  <Text style={styles.statsWinnerVotes}>{lastResolved.winner_votes} votes</Text>
                )}
              </View>
            )}
            <View style={styles.statsRow}>
              <View style={styles.statCell}>
                <Text style={styles.statCellValue}>{lastEntries.length}</Text>
                <Text style={styles.statCellLabel}>ENTRIES</Text>
              </View>
              {myLastRank !== null && (
                <View style={styles.statCell}>
                  <Text style={styles.statCellValue}>#{myLastRank}</Text>
                  <Text style={styles.statCellLabel}>YOUR RANK</Text>
                </View>
              )}
              {myLastEntry && (
                <View style={styles.statCell}>
                  <Text style={styles.statCellValue}>{myLastEntry.vote_count}</Text>
                  <Text style={styles.statCellLabel}>YOUR VOTES</Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity style={styles.seeResultsBtn} onPress={() => router.push('/(tabs)/leaderboard')}>
            <Text style={styles.seeResultsBtnText}>See full results →</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }
    return (
      <View style={styles.center}>
        <Text style={styles.noPulseIcon}>◉</Text>
        <Text style={styles.noPulseTitle}>Signal quiet.</Text>
        <Text style={styles.noPulseText}>The Pulse fires without warning.{'\n'}This is the tab to be on when it does.</Text>
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
        <Text style={styles.votingText}>Submissions are closed.{'\n'}Now go pick a winner.</Text>
        {countdown && <Text style={styles.votingCountdown}>{countdown} left</Text>}
        <TouchableOpacity style={styles.votingBtn} onPress={() => router.push('/(tabs)/leaderboard')}>
          <Text style={styles.votingBtnText}>See the entries →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const needCamera = mode === 'photo' || mode === 'video';
  const hasCapture = mode === 'photo' ? !!capturedPhoto : mode === 'video' ? !!capturedVideo : false;

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <LinearGradient colors={['#ff4444', '#cc0000']} style={styles.topBar}>
        <View>
          <Text style={styles.liveLabel}>⚡ PULSE IS LIVE</Text>
          {entryCount !== null && (
            <Text style={styles.entryCount}>{entryCount} {entryCount === 1 ? 'entry' : 'entries'} so far</Text>
          )}
        </View>
        {countdown && <Text style={styles.countdown}>{countdown}</Text>}
      </LinearGradient>

      {/* Prompt */}
      <View style={styles.promptContainer}>
        <Text style={styles.prompt}>"{pulse.prompt}"</Text>
      </View>

      {/* Mode selector */}
      <View style={styles.modeSelector}>
        {(['text', 'photo', 'video'] as CaptureMode[]).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.modeTab, mode === m && styles.modeTabActive]}
            onPress={async () => {
              if (m !== 'text' && !cameraPermission?.granted) await requestCameraPermission();
              setMode(m);
              setCapturedPhoto(null);
              setCapturedVideo(null);
              if (isRecording) stopRecording();
            }}
          >
            <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
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
        ) : capturedVideo ? (
          <VideoPreview uri={capturedVideo} onRetake={() => setCapturedVideo(null)} />
        ) : cameraPermission?.granted ? (
          <View style={styles.cameraContainer}>
            <CameraView ref={cameraRef} style={styles.camera} facing="back" mode={mode === 'video' ? 'video' : 'picture'} />
            {mode === 'photo' ? (
              <TouchableOpacity style={styles.shutterBtn} onPress={takePhoto}>
                <View style={styles.shutterInner} />
              </TouchableOpacity>
            ) : (
              <View style={styles.videoControls}>
                {isRecording && (
                  <View style={styles.recordingBadge}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingTimer}>
                      {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')} / 0:30
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.shutterBtn, isRecording && styles.shutterBtnRecording]}
                  onPress={isRecording ? stopRecording : startRecording}
                >
                  {isRecording
                    ? <View style={styles.stopInner} />
                    : <View style={styles.shutterInner} />}
                </TouchableOpacity>
              </View>
            )}
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

      {/* Submit — only shown when there's something to submit */}
      {(mode === 'text' || hasCapture) && !isRecording && (
        <TouchableOpacity
          style={[styles.submitBtn, submitState === 'submitting' && styles.submitBtnDisabled]}
          onPress={submit}
          disabled={submitState === 'submitting'}
        >
          {submitState === 'submitting' ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.submitBtnText}>Submit</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

function VideoPreview({ uri, onRetake }: { uri: string; onRetake: () => void }) {
  return (
    <View style={styles.previewContainer}>
      <Video
        source={{ uri }}
        style={styles.preview}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        useNativeControls={false}
      />
      <TouchableOpacity style={styles.retakeBtn} onPress={onRetake}>
        <Text style={styles.retakeBtnText}>Retake</Text>
      </TouchableOpacity>
    </View>
  );
}

function SubmittedView({ entry, pulse, countdown }: { entry: Entry; pulse: Pulse; countdown: string | null }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.submittedContent}>
      <Text style={styles.submittedTitle}>You're in.</Text>
      <Text style={styles.submittedSub}>
        Voting opens when the submission window closes.
      </Text>
      {countdown && (
        <Text style={styles.submittedCountdown}>{countdown} remaining</Text>
      )}
      <View style={styles.myEntryCard}>
        <Text style={styles.myEntryLabel}>YOUR ENTRY</Text>
        {entry.text_content ? (
          <Text style={styles.myEntryText}>{entry.text_content}</Text>
        ) : entry.media_url ? (
          entry.content_type === 'video' ? (
            <VideoPreview uri={entry.media_url} onRetake={() => {}} />
          ) : (
            <Image source={{ uri: entry.media_url }} style={styles.myEntryImage} />
          )
        ) : null}
      </View>
      <TouchableOpacity style={styles.watchBoardBtn} onPress={() => router.push('/(tabs)/leaderboard')}>
        <Text style={styles.watchBoardBtnText}>Watch the rankings →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },

  topBar: { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveLabel: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 2 },
  entryCount: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 3, fontWeight: '600' },
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
  shutterBtnRecording: { borderColor: '#ff4444', backgroundColor: 'rgba(255,68,68,0.2)' },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' },
  stopInner: { width: 28, height: 28, borderRadius: 4, backgroundColor: '#ff4444' },

  videoControls: { position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center', gap: 12 },
  recordingBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4444' },
  recordingTimer: { color: '#fff', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },

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
  submittedTitle: { fontSize: 40, fontWeight: '900', color: '#fff' },
  submittedSub: { fontSize: 15, color: '#555', lineHeight: 23 },
  submittedCountdown: { fontSize: 13, color: '#ff4444', fontVariant: ['tabular-nums'] },
  myEntryCard: { backgroundColor: '#0f0f0f', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#1f1f1f', gap: 10, marginTop: 8 },
  myEntryLabel: { fontSize: 10, fontWeight: '700', color: '#444', letterSpacing: 3 },
  myEntryText: { fontSize: 18, color: '#fff', lineHeight: 27 },
  myEntryImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 10 },
  watchBoardBtn: { paddingVertical: 16, borderRadius: 10, borderWidth: 1, borderColor: '#222', alignItems: 'center', marginTop: 4 },
  watchBoardBtnText: { color: '#888', fontSize: 14, fontWeight: '600' },

  noPulseIcon: { fontSize: 52, color: '#1a1a1a', marginBottom: 4 },
  noPulseTitle: { fontSize: 24, fontWeight: '800', color: '#333' },
  noPulseText: { fontSize: 15, color: '#2a2a2a', textAlign: 'center', lineHeight: 23 },

  statsContent: { paddingTop: 80, paddingHorizontal: 20, paddingBottom: 48, gap: 20 },
  statsWaiting: { fontSize: 22, fontWeight: '800', color: '#333', textAlign: 'center' },
  statsWaitingSub: { fontSize: 14, color: '#2a2a2a', textAlign: 'center', lineHeight: 22 },
  statsCard: { backgroundColor: '#0d0d0d', borderRadius: 16, borderWidth: 1, borderColor: '#1a1a1a', padding: 20, gap: 16 },
  statsCardLabel: { fontSize: 11, fontWeight: '800', color: '#444', letterSpacing: 2 },
  statsCardPrompt: { fontSize: 18, fontWeight: '700', color: '#ddd', lineHeight: 26 },
  statsWinner: { backgroundColor: '#0a0f0a', borderRadius: 10, padding: 14, gap: 4, borderWidth: 1, borderColor: '#1a2a1a' },
  statsWinnerLabel: { fontSize: 10, fontWeight: '800', color: '#2a5a2a', letterSpacing: 2 },
  statsWinnerName: { fontSize: 18, fontWeight: '800', color: '#4caf50' },
  statsWinnerVotes: { fontSize: 13, color: '#2a5a2a' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCell: { flex: 1, backgroundColor: '#111', borderRadius: 10, padding: 14, alignItems: 'center', gap: 4 },
  statCellValue: { fontSize: 22, fontWeight: '900', color: '#fff' },
  statCellLabel: { fontSize: 10, fontWeight: '700', color: '#444', letterSpacing: 1 },
  seeResultsBtn: { alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, borderWidth: 1, borderColor: '#222' },
  seeResultsBtnText: { color: '#555', fontSize: 14, fontWeight: '600' },

  votingIcon: { fontSize: 48, marginBottom: 4 },
  votingTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  votingText: { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 23 },
  votingCountdown: { fontSize: 14, color: '#ff8800', fontVariant: ['tabular-nums'], marginTop: 4 },
  votingBtn: { marginTop: 8, backgroundColor: '#fff', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 10 },
  votingBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
});
