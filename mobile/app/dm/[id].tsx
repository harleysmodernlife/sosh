import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { DirectMessage } from '@/lib/types';

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DMThreadScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [pendingMedia, setPendingMedia] = useState<{ uri: string; type: 'image' | 'video'; mimeType: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [otherName, setOtherName] = useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    async function load() {
      try {
        const msgs = await api.dm.messages(conversationId);
        setMessages(msgs);
        // Derive the other user's name from the first message not sent by current user
        const other = msgs.find(m => m.sender_id !== currentUserId);
        if (other) setOtherName(other.sender_display_name ?? `@${other.sender_username}` ?? 'User');
        await api.dm.markRead(conversationId);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [conversationId, currentUserId]);

  async function pickMedia() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const isVideo = asset.type === 'video';
    const mimeType = isVideo ? 'video/mp4' : (asset.mimeType ?? 'image/jpeg');
    setPendingMedia({ uri: asset.uri, type: isVideo ? 'video' : 'image', mimeType });
  }

  async function send() {
    const body = draft.trim();
    if ((!body && !pendingMedia) || sending) return;
    setSending(true);
    const savedDraft = body;
    const savedMedia = pendingMedia;
    setDraft('');
    setPendingMedia(null);
    try {
      let mediaUrl: string | undefined;
      let mediaType: 'image' | 'video' | undefined;
      if (savedMedia) {
        const { upload_url, media_key } = await api.media.presign(savedMedia.mimeType);
        await api.media.upload(upload_url, savedMedia.uri, savedMedia.mimeType);
        // Build public URL from media_key
        const supabaseUrl = 'https://gxtbcxkdodmfikkhncmw.supabase.co';
        mediaUrl = `${supabaseUrl}/storage/v1/object/public/sosh-media/${media_key}`;
        mediaType = savedMedia.type;
      }
      const msg = await api.dm.send(conversationId, body || null, mediaUrl, mediaType);
      setMessages(prev => [msg, ...prev]);
    } catch (e) {
      setDraft(savedDraft);
      setPendingMedia(savedMedia);
      Alert.alert('Failed to send', 'Please try again.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backTap}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{otherName || 'Message'}</Text>
        <View style={styles.backTap} />
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({ item, index }) => {
          const isMe = item.sender_id === currentUserId;
          const prevMsg = messages[index + 1]; // list is newest-first
          const showAvatar = !isMe && (!prevMsg || prevMsg.sender_id !== item.sender_id);
          return (
            <MessageBubble
              msg={item}
              isMe={isMe}
              showAvatar={showAvatar}
            />
          );
        }}
        inverted
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyThread}>
            <Text style={styles.emptyThreadText}>Send a message to start the conversation.</Text>
          </View>
        }
      />

      {pendingMedia && (
        <View style={styles.mediaPreviewRow}>
          <Image source={{ uri: pendingMedia.uri }} style={styles.mediaPreviewThumb} />
          <Text style={styles.mediaPreviewLabel}>{pendingMedia.type === 'video' ? '📹 Video' : '📷 Photo'} ready</Text>
          <TouchableOpacity onPress={() => setPendingMedia(null)} style={styles.mediaPreviewRemove}>
            <Text style={styles.mediaPreviewRemoveText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.composer}>
        <TouchableOpacity onPress={pickMedia} style={styles.mediaBtn} activeOpacity={0.7}>
          <Text style={styles.mediaBtnIcon}>📎</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.composerInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message..."
          placeholderTextColor="#444"
          multiline
          maxLength={1000}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!draft.trim() && !pendingMedia || sending) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={(!draft.trim() && !pendingMedia) || sending}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={styles.sendBtnText}>↑</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function VideoBubble({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, p => { p.loop = true; });
  return (
    <VideoView
      player={player}
      style={styles.mediaBubbleVideo}
      contentFit="cover"
      nativeControls
    />
  );
}

function MessageBubble({ msg, isMe, showAvatar }: { msg: DirectMessage; isMe: boolean; showAvatar: boolean }) {
  const hasMedia = !!msg.media_url;
  const mediaOnly = hasMedia && !msg.body;
  return (
    <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
      {!isMe && (
        <View style={styles.avatarSlot}>
          {showAvatar && (
            <View style={[styles.avatar, msg.sender_accent_color ? { borderColor: msg.sender_accent_color } : undefined]}>
              {msg.sender_avatar_url ? (
                <Image source={{ uri: msg.sender_avatar_url }} style={styles.avatarImg} />
              ) : (
                <Text style={[styles.avatarLetter, msg.sender_accent_color ? { color: msg.sender_accent_color } : undefined]}>
                  {(msg.sender_username ?? '?')[0].toUpperCase()}
                </Text>
              )}
            </View>
          )}
        </View>
      )}
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, mediaOnly && styles.bubbleMedia]}>
        {hasMedia && msg.media_type === 'image' && (
          <Image source={{ uri: msg.media_url! }} style={styles.mediaBubbleImg} resizeMode="cover" />
        )}
        {hasMedia && msg.media_type === 'video' && (
          <VideoBubble uri={msg.media_url!} />
        )}
        {msg.body ? (
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{msg.body}</Text>
        ) : null}
        <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{formatTime(msg.created_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#111',
  },
  backTap: { width: 44, height: 44, justifyContent: 'center' },
  backArrow: { fontSize: 24, color: '#fff' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#fff' },

  messageList: { paddingHorizontal: 16, paddingVertical: 16, gap: 4 },

  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 2 },
  bubbleRowMe: { flexDirection: 'row-reverse' },

  avatarSlot: { width: 32, flexShrink: 0 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333', overflow: 'hidden' },
  avatarImg: { width: 32, height: 32, borderRadius: 16 },
  avatarLetter: { fontSize: 13, fontWeight: '800', color: '#fff' },

  bubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, gap: 3 },
  bubbleMe: { backgroundColor: '#fff', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#141414', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#222' },
  bubbleText: { fontSize: 15, color: '#111', lineHeight: 20 },
  bubbleTextMe: { color: '#000' },
  bubbleTime: { fontSize: 10, color: '#888', textAlign: 'right' },
  bubbleTimeMe: { color: 'rgba(0,0,0,0.4)' },

  emptyThread: { paddingTop: 60, alignItems: 'center' },
  emptyThreadText: { fontSize: 14, color: '#333', textAlign: 'center' },

  mediaPreviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#111', backgroundColor: '#000',
  },
  mediaPreviewThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#111' },
  mediaPreviewLabel: { flex: 1, color: '#aaa', fontSize: 13 },
  mediaPreviewRemove: { padding: 6 },
  mediaPreviewRemoveText: { color: '#555', fontSize: 16 },

  composer: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-end',
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#111',
    backgroundColor: '#000',
  },
  mediaBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  mediaBtnIcon: { fontSize: 22 },
  composerInput: {
    flex: 1, backgroundColor: '#111', borderWidth: 1, borderColor: '#222',
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11,
    color: '#fff', fontSize: 15, maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.3 },
  sendBtnText: { fontSize: 18, fontWeight: '900', color: '#000' },

  bubbleMedia: { padding: 4, overflow: 'hidden' },
  mediaBubbleImg: { width: 220, height: 220, borderRadius: 14 },
  mediaBubbleVideo: { width: 220, height: 220, borderRadius: 14 },
});
