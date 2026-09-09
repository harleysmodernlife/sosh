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
  FlatList,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/lib/api';
import { compressImage } from '@/lib/compress';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface PendingMedia {
  uri: string;
  type: 'photo' | 'video';
  mimeType: string;
}

export default function ComposeScreen() {
  const [text, setText] = useState('');
  const [caption, setCaption] = useState('');
  const [mediaItems, setMediaItems] = useState<PendingMedia[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const hasMedia = mediaItems.length > 0;
  const hasContent = text.trim().length > 0 || hasMedia;

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to choose media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (result.canceled || !result.assets.length) return;
    const picked: PendingMedia[] = result.assets.map(a => ({
      uri: a.uri,
      type: a.type === 'video' ? 'video' : 'photo',
      mimeType: a.type === 'video' ? 'video/mp4' : (a.mimeType ?? 'image/jpeg'),
    }));
    setMediaItems(picked);
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
    setMediaItems([{ uri: result.assets[0].uri, type: 'video', mimeType: 'video/mp4' }]);
    setText('');
  }

  async function takePhoto() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
    if (photo?.uri) {
      setMediaItems(prev => [...prev, { uri: photo.uri, type: 'photo', mimeType: 'image/jpeg' }]);
      setShowCamera(false);
      setText('');
    }
  }

  function removeItem(index: number) {
    setMediaItems(prev => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    if (!hasContent) return;
    setSubmitting(true);
    try {
      if (hasMedia) {
        // Upload all items then create post with carousel
        const uploadedItems: { media_url: string; media_type: string }[] = [];
        for (const item of mediaItems) {
          const uploadUri = item.type === 'photo' ? await compressImage(item.uri) : item.uri;
          const { upload_url, media_key } = await api.media.presign(item.mimeType);
          await api.media.upload(upload_url, uploadUri, item.mimeType);
          uploadedItems.push({ media_url: media_key, media_type: item.type });
        }

        const contentType = mediaItems.some(i => i.type === 'video') ? 'video' : 'photo';

        if (uploadedItems.length === 1) {
          // Single item — use legacy path for simplicity
          await api.posts.create({
            content_type: contentType,
            media_url: uploadedItems[0].media_url,
            caption: caption.trim() || undefined,
          });
        } else {
          // Multi-image carousel
          await api.posts.create({
            content_type: contentType,
            media_items: uploadedItems,
            caption: caption.trim() || undefined,
          });
        }
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
        {hasMedia ? (
          <>
            {/* Media strip */}
            <FlatList
              data={mediaItems}
              keyExtractor={(_, i) => String(i)}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mediaStrip}
              renderItem={({ item, index }) => (
                <View style={styles.mediaTile}>
                  <Image source={{ uri: item.uri }} style={styles.mediaTileImg} resizeMode="cover" />
                  {item.type === 'video' && (
                    <View style={styles.videoBadge}>
                      <Text style={styles.videoBadgeText}>▶</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.removeTile} onPress={() => removeItem(index)}>
                    <Text style={styles.removeTileText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
            {mediaItems.length < 10 && (
              <TouchableOpacity style={styles.addMoreBtn} onPress={pickFromLibrary}>
                <Text style={styles.addMoreText}>+ Add more ({mediaItems.length}/10)</Text>
              </TouchableOpacity>
            )}
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
          </>
        ) : (
          <>
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
            <View style={styles.charRow}>
              <Text style={styles.charCount}>{text.length}/500</Text>
            </View>
          </>
        )}
      </ScrollView>

      {!hasMedia && (
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

  // Media strip (multi-image)
  mediaStrip: { padding: 12, gap: 8 },
  mediaTile: { position: 'relative', marginRight: 2 },
  mediaTileImg: { width: 110, height: 110, borderRadius: 8 },
  videoBadge: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  videoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  removeTile: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
  },
  removeTileText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  addMoreBtn: {
    marginHorizontal: 16, marginTop: 4, marginBottom: 8,
    paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#222', borderStyle: 'dashed',
    alignItems: 'center',
  },
  addMoreText: { color: '#444', fontSize: 13, fontWeight: '600' },

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
