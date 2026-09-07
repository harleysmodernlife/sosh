import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/lib/api';

type Mode = 'text' | 'camera' | 'library';
type MediaType = 'photo' | 'video';

export default function ComposeScreen() {
  const [text, setText] = useState('');
  const [caption, setCaption] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>('photo');
  const [showCamera, setShowCamera] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [cameraMode, setCameraMode] = useState<MediaType>('photo');
  const [submitting, setSubmitting] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasContent = text.trim().length > 0 || mediaUri !== null;

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to choose media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setMediaUri(asset.uri);
    setMediaType(asset.type === 'video' ? 'video' : 'photo');
    setShowCamera(false);
    setText('');
  }

  async function takePhoto() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
    if (photo) {
      setMediaUri(photo.uri);
      setMediaType('photo');
      setShowCamera(false);
    }
  }

  async function startRecording() {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true);
    setRecordingSeconds(0);
    recordingTimer.current = setInterval(() => {
      setRecordingSeconds(s => {
        if (s + 1 >= 30) cameraRef.current?.stopRecording();
        return s + 1;
      });
    }, 1000);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 30 });
      if (video?.uri) {
        setMediaUri(video.uri);
        setMediaType('video');
      }
    } catch {}
    finally {
      setIsRecording(false);
      setShowCamera(false);
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
    }
  }

  function stopRecording() {
    cameraRef.current?.stopRecording();
    // cleanup happens in startRecording's finally block
  }

  async function openCamera(type: MediaType) {
    if (!cameraPermission?.granted) await requestCameraPermission();
    setCameraMode(type);
    setShowCamera(true);
  }

  async function submit() {
    if (!hasContent) return;
    setSubmitting(true);
    try {
      if (mediaUri) {
        const mimeType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
        const { upload_url, media_key } = await api.media.presign(mimeType);
        await api.media.upload(upload_url, mediaUri, mimeType);
        await api.posts.create({
          content_type: mediaType,
          media_url: media_key,
          caption: caption.trim() || undefined,
        });
      } else {
        await api.posts.create({
          content_type: 'text',
          text_content: text.trim(),
          caption: caption.trim() || undefined,
        });
      }
      router.back();
    } catch (err: any) {
      Alert.alert('Could not post', err.message ?? 'Try again');
    } finally {
      setSubmitting(false);
    }
  }

  if (showCamera) {
    return (
      <View style={styles.cameraScreen}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode={cameraMode === 'video' ? 'video' : 'picture'}
        />
        <TouchableOpacity style={styles.cameraClose} onPress={() => setShowCamera(false)}>
          <Text style={styles.cameraCloseText}>✕</Text>
        </TouchableOpacity>
        {isRecording && (
          <View style={styles.recBadge}>
            <View style={styles.recDot} />
            <Text style={styles.recTimer}>
              {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.shutterBtn, isRecording && styles.shutterBtnRec]}
          onPress={cameraMode === 'photo' ? takePhoto : (isRecording ? stopRecording : startRecording)}
        >
          {cameraMode === 'video' && isRecording
            ? <View style={styles.stopShape} />
            : <View style={styles.shutterInner} />}
        </TouchableOpacity>
        {cameraMode === 'photo' && (
          <TouchableOpacity style={styles.switchToVideo} onPress={() => setCameraMode('video')}>
            <Text style={styles.switchText}>Video</Text>
          </TouchableOpacity>
        )}
        {cameraMode === 'video' && !isRecording && (
          <TouchableOpacity style={styles.switchToVideo} onPress={() => setCameraMode('photo')}>
            <Text style={styles.switchText}>Photo</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Post</Text>
        <TouchableOpacity
          style={[styles.postBtn, (!hasContent || submitting) && styles.postBtnDisabled]}
          onPress={submit}
          disabled={!hasContent || submitting}
        >
          {submitting
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={styles.postBtnText}>Post</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        {mediaUri ? (
          <View style={styles.mediaPreview}>
            <Image source={{ uri: mediaUri }} style={styles.previewImage} resizeMode="cover" />
            <TouchableOpacity style={styles.removeMedia} onPress={() => setMediaUri(null)}>
              <Text style={styles.removeMediaText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TextInput
            style={styles.textInput}
            placeholder="What's on your mind?"
            placeholderTextColor="#444"
            value={text}
            onChangeText={t => setText(t.slice(0, 500))}
            multiline
            maxLength={500}
            autoFocus
          />
        )}

        {mediaUri && (
          <TextInput
            style={styles.captionInput}
            placeholder="Add a caption..."
            placeholderTextColor="#444"
            value={caption}
            onChangeText={setCaption}
            maxLength={200}
          />
        )}

        {!mediaUri && (
          <View style={styles.charRow}>
            <Text style={styles.charCount}>{text.length}/500</Text>
          </View>
        )}
      </ScrollView>

      {!mediaUri && (
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolBtn} onPress={() => openCamera('photo')}>
            <Text style={styles.toolIcon}>📷</Text>
            <Text style={styles.toolLabel}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => openCamera('video')}>
            <Text style={styles.toolIcon}>🎥</Text>
            <Text style={styles.toolLabel}>Video</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={pickFromLibrary}>
            <Text style={styles.toolIcon}>🖼</Text>
            <Text style={styles.toolLabel}>Library</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  cancel: { color: '#555', fontSize: 15, width: 60 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  postBtn: { backgroundColor: '#fff', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, width: 60, alignItems: 'center' },
  postBtnDisabled: { opacity: 0.3 },
  postBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },

  body: { flex: 1 },

  textInput: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 27,
    padding: 20,
    minHeight: 160,
    textAlignVertical: 'top',
  },
  charRow: { paddingHorizontal: 20, alignItems: 'flex-end' },
  charCount: { color: '#333', fontSize: 12 },

  mediaPreview: { position: 'relative' },
  previewImage: { width: '100%', aspectRatio: 4 / 3 },
  removeMedia: {
    position: 'absolute', top: 12, right: 12,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  removeMediaText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  captionInput: {
    color: '#fff',
    fontSize: 15,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#111',
  },

  toolbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#111',
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  toolBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', gap: 4 },
  toolIcon: { fontSize: 22 },
  toolLabel: { color: '#555', fontSize: 11, fontWeight: '600' },

  // Camera overlay
  cameraScreen: { flex: 1, backgroundColor: '#000' },
  cameraClose: {
    position: 'absolute', top: 56, left: 20, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  cameraCloseText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  recBadge: {
    position: 'absolute', top: 60, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4444' },
  recTimer: { color: '#fff', fontSize: 13, fontWeight: '600' },
  shutterBtn: {
    position: 'absolute', bottom: 48, alignSelf: 'center',
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: '#fff',
  },
  shutterBtnRec: { borderColor: '#ff4444', backgroundColor: 'rgba(255,68,68,0.2)' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  stopShape: { width: 28, height: 28, borderRadius: 4, backgroundColor: '#ff4444' },
  switchToVideo: {
    position: 'absolute', bottom: 64, right: 32,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  switchText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
