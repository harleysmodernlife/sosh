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

type MediaType = 'photo' | 'video';

export default function ComposeScreen() {
  const [text, setText] = useState('');
  const [caption, setCaption] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>('photo');
  const [showCamera, setShowCamera] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

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

  async function openPhotoCamera() {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Permission needed', 'Allow camera access to take photos.');
        return;
      }
    }
    setShowCamera(true);
  }

  async function recordVideoNative() {
    // Use native camera app for video — expo-camera recordAsync is unreliable in Expo Go on Android
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to record video.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 30,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setMediaUri(result.assets[0].uri);
    setMediaType('video');
    setText('');
  }

  async function takePhoto() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
    if (photo?.uri) {
      setMediaUri(photo.uri);
      setMediaType('photo');
      setShowCamera(false);
      setText('');
    }
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
          mode="picture"
        />
        <TouchableOpacity style={styles.cameraClose} onPress={() => setShowCamera(false)}>
          <Text style={styles.cameraCloseText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shutterBtn} onPress={takePhoto}>
          <View style={styles.shutterInner} />
        </TouchableOpacity>
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
            {mediaType === 'video' && (
              <View style={styles.videoBadge}>
                <Text style={styles.videoBadgeText}>▶ VIDEO</Text>
              </View>
            )}
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
          <View style={styles.captionSection}>
            <Text style={styles.captionLabel}>CAPTION</Text>
            <TextInput
              style={styles.captionInput}
              placeholder="Say something about this..."
              placeholderTextColor="#444"
              value={caption}
              onChangeText={t => setCaption(t.slice(0, 300))}
              maxLength={300}
              multiline
              autoFocus
            />
            <Text style={styles.captionCount}>{caption.length}/300</Text>
          </View>
        )}

        {!mediaUri && (
          <View style={styles.charRow}>
            <Text style={styles.charCount}>{text.length}/500</Text>
          </View>
        )}
      </ScrollView>

      {!mediaUri && (
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolBtn} onPress={openPhotoCamera}>
            <Text style={styles.toolIcon}>📷</Text>
            <Text style={styles.toolLabel}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={recordVideoNative}>
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
  videoBadge: {
    position: 'absolute', bottom: 12, left: 12,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  videoBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  captionSection: {
    borderTopWidth: 1,
    borderTopColor: '#111',
    padding: 20,
    gap: 10,
  },
  captionLabel: { fontSize: 10, fontWeight: '800', color: '#444', letterSpacing: 3 },
  captionInput: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  captionCount: { fontSize: 11, color: '#333', textAlign: 'right' },

  toolbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#111',
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  toolBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', gap: 4 },
  toolIcon: { fontSize: 22 },
  toolLabel: { color: '#555', fontSize: 11, fontWeight: '600' },

  cameraScreen: { flex: 1, backgroundColor: '#000' },
  cameraClose: {
    position: 'absolute', top: 56, left: 20, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  cameraCloseText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  shutterBtn: {
    position: 'absolute', bottom: 48, alignSelf: 'center',
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: '#fff',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
});
