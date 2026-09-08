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
import { MentionText } from './MentionText';

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

type ThreadItem = { comment: Comment; isReply: boolean };

function buildThreadedList(comments: Comment[]): ThreadItem[] {
  const roots = comments.filter(c => !c.parent_id);
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parent_id) {
      const arr = repliesByParent.get(c.parent_id) ?? [];
      arr.push(c);
      repliesByParent.set(c.parent_id, arr);
    }
  }
  const result: ThreadItem[] = [];
  for (const root of roots) {
    result.push({ comment: root, isReply: false });
    for (const reply of (repliesByParent.get(root.id) ?? [])) {
      result.push({ comment: reply, isReply: true });
    }
  }
  return result;
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
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

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
    const parentId = replyingTo?.id;
    setReplyingTo(null);
    try {
      const comment = await api.comments.create(postId, text, parentId);
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
            // Remove comment and its replies
            setComments(prev => prev.filter(c => c.id !== comment.id && c.parent_id !== comment.id));
            onCountChange?.(-1);
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  }

  function startReply(comment: Comment) {
    setReplyingTo(comment);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  const threaded = buildThreadedList(comments);

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
            data={threaded}
            keyExtractor={item => item.comment.id}
            renderItem={({ item }) => (
              <CommentRow
                comment={item.comment}
                isReply={item.isReply}
                isOwn={item.comment.user_id === currentUserId}
                onDelete={() => deleteComment(item.comment)}
                onUserPress={() => { onClose(); router.push(`/user/${item.comment.user_id}`); }}
                onReply={item.isReply ? undefined : () => startReply(item.comment)}
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

        {replyingTo && (
          <View style={styles.replyBanner}>
            <Text style={styles.replyBannerText}>
              Replying to {replyingTo.display_name ?? `@${replyingTo.username}`}
            </Text>
            <TouchableOpacity onPress={() => setReplyingTo(null)}>
              <Text style={styles.replyBannerCancel}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={draft}
            onChangeText={t => setDraft(t.slice(0, 300))}
            placeholder={replyingTo ? `Reply to ${replyingTo.display_name ?? `@${replyingTo.username}`}...` : 'Add a comment...'}
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
  isReply,
  isOwn,
  onDelete,
  onUserPress,
  onReply,
}: {
  comment: Comment;
  isReply: boolean;
  isOwn: boolean;
  onDelete: () => void;
  onUserPress: () => void;
  onReply?: () => void;
}) {
  return (
    <View style={[styles.row, isReply && styles.rowReply]}>
      {isReply && <View style={styles.replyLine} />}
      <TouchableOpacity onPress={onUserPress}>
        <View style={[styles.avatar, isReply && styles.avatarSmall, comment.accent_color ? { borderColor: comment.accent_color } : undefined]}>
          {comment.avatar_url ? (
            <Image source={{ uri: comment.avatar_url }} style={isReply ? styles.avatarImgSmall : styles.avatarImg} />
          ) : (
            <Text style={[styles.avatarLetter, isReply && styles.avatarLetterSmall, comment.accent_color ? { color: comment.accent_color } : undefined]}>
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
        <MentionText text={comment.body} style={styles.body} />
        {onReply && (
          <TouchableOpacity onPress={onReply} style={styles.replyBtn}>
            <Text style={styles.replyBtnText}>Reply</Text>
          </TouchableOpacity>
        )}
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
  list: { padding: 16, gap: 12, paddingBottom: 8 },
  empty: { paddingTop: 40, alignItems: 'center' },
  emptyText: { color: '#333', fontSize: 14 },

  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rowReply: { paddingLeft: 24 },
  replyLine: { position: 'absolute', left: 16, top: 0, bottom: 0, width: 1, backgroundColor: '#1c1c1c' },

  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#1a1a1a',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#333', overflow: 'hidden', flexShrink: 0,
  },
  avatarSmall: { width: 26, height: 26, borderRadius: 13 },
  avatarImg: { width: 34, height: 34, borderRadius: 17 },
  avatarImgSmall: { width: 26, height: 26, borderRadius: 13 },
  avatarLetter: { fontSize: 14, fontWeight: '800', color: '#fff' },
  avatarLetterSmall: { fontSize: 11 },

  bubble: { flex: 1, backgroundColor: '#0d0d0d', borderRadius: 12, padding: 12, gap: 4 },
  bubbleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 13, fontWeight: '700', color: '#fff' },
  time: { fontSize: 11, color: '#444' },
  body: { fontSize: 14, color: '#ccc', lineHeight: 20 },

  replyBtn: { marginTop: 4 },
  replyBtnText: { fontSize: 12, color: '#444', fontWeight: '600' },

  deleteBtn: { paddingTop: 8, paddingLeft: 4 },
  deleteText: { fontSize: 14, color: '#333' },

  replyBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#111', backgroundColor: '#0a0a0a',
  },
  replyBannerText: { fontSize: 12, color: '#555' },
  replyBannerCancel: { fontSize: 14, color: '#333', paddingLeft: 12 },

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
