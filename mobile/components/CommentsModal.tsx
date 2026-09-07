import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import type { Comment } from '@/lib/types';
import { supabase } from '@/lib/supabase';

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function CommentsModal({
  postId,
  visible,
  onClose,
  onCountChange,
}: {
  postId: string;
  visible: boolean;
  onClose: () => void;
  onCountChange?: (delta: number) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!visible || !postId) return;
    setLoading(true);
    api.comments.list(postId)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, postId]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      const comment = await api.comments.create(postId, text);
      setComments(prev => [...prev, comment]);
      onCountChange?.(1);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      setDraft(text);
      Alert.alert('Could not post', err.message);
    } finally {
      setSending(false);
    }
  }

  async function deleteComment(comment: Comment) {
    Alert.alert('Delete comment?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.comments.delete(postId, comment.id);
            setComments(prev => prev.filter(c => c.id !== comment.id));
            onCountChange?.(-1);
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Comments</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>Done</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color="#fff" /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={comments}
            keyExtractor={c => c.id}
            renderItem={({ item }) => (
              <CommentRow
                comment={item}
                isOwn={item.user_id === currentUserId}
                onDelete={() => deleteComment(item)}
                onUserPress={() => { onClose(); router.push(`/user/${item.user_id}`); }}
              />
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No comments yet. Be the first.</Text>
              </View>
            }
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={t => setDraft(t.slice(0, 300))}
            placeholder="Add a comment..."
            placeholderTextColor="#444"
            multiline
            maxLength={300}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={send}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!draft.trim() || sending}
          >
            {sending
              ? <ActivityIndicator color="#000" size="small" />
              : <Text style={styles.sendText}>Post</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CommentRow({
  comment,
  isOwn,
  onDelete,
  onUserPress,
}: {
  comment: Comment;
  isOwn: boolean;
  onDelete: () => void;
  onUserPress: () => void;
}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={onUserPress}>
        <View style={[styles.avatar, comment.accent_color ? { borderColor: comment.accent_color } : undefined]}>
          {comment.avatar_url ? (
            <Image source={{ uri: comment.avatar_url }} style={styles.avatarImg} />
          ) : (
            <Text style={[styles.avatarLetter, comment.accent_color ? { color: comment.accent_color } : undefined]}>
              {(comment.username ?? '?')[0].toUpperCase()}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      <View style={styles.bubble}>
        <View style={styles.bubbleTop}>
          <TouchableOpacity onPress={onUserPress}>
            <Text style={styles.name}>{comment.display_name ?? `@${comment.username}`}</Text>
          </TouchableOpacity>
          <Text style={styles.time}>{formatTimeAgo(comment.created_at)}</Text>
        </View>
        <Text style={styles.body}>{comment.body}</Text>
      </View>
      {isOwn && (
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#111',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#fff' },
  close: { fontSize: 15, fontWeight: '600', color: '#555' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 16, paddingBottom: 8 },
  empty: { paddingTop: 40, alignItems: 'center' },
  emptyText: { color: '#333', fontSize: 14 },

  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#1a1a1a',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#333', overflow: 'hidden', flexShrink: 0,
  },
  avatarImg: { width: 34, height: 34, borderRadius: 17 },
  avatarLetter: { fontSize: 14, fontWeight: '800', color: '#fff' },
  bubble: { flex: 1, backgroundColor: '#0d0d0d', borderRadius: 12, padding: 12, gap: 4 },
  bubbleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 13, fontWeight: '700', color: '#fff' },
  time: { fontSize: 11, color: '#444' },
  body: { fontSize: 14, color: '#ccc', lineHeight: 20 },
  deleteBtn: { paddingTop: 8, paddingLeft: 4 },
  deleteText: { fontSize: 14, color: '#333' },

  inputRow: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-end',
    padding: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    borderTopWidth: 1, borderTopColor: '#111',
  },
  input: {
    flex: 1, backgroundColor: '#111', borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 10, color: '#fff', fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.3 },
  sendText: { fontSize: 13, fontWeight: '800', color: '#000' },
});
