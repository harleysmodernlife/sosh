import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { api } from '@/lib/api';
import type { Conversation } from '@/lib/types';

interface Props {
  visible: boolean;
  postId: string;
  postPreview: string;
  onClose: () => void;
}

export function ShareViaDMModal({ visible, postId, postPreview, onClose }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null); // conversationId being sent to

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    api.dm.conversations()
      .then(setConversations)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible]);

  async function sendTo(conv: Conversation) {
    if (sending) return;
    setSending(conv.conversation_id);
    const link = `sosh://post/${postId}`;
    const body = postPreview ? `${postPreview}\n${link}` : link;
    try {
      await api.dm.send(conv.conversation_id, body);
      onClose();
    } catch {
      Alert.alert('Failed to send', 'Please try again.');
    } finally {
      setSending(null);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Send to...</Text>

        {loading ? (
          <ActivityIndicator color="#fff" style={styles.spinner} />
        ) : conversations.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No conversations yet.</Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={c => c.conversation_id}
            renderItem={({ item }) => (
              <ConvRow
                conv={item}
                onPress={() => sendTo(item)}
                isSending={sending === item.conversation_id}
              />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
}

function ConvRow({
  conv,
  onPress,
  isSending,
}: {
  conv: Conversation;
  onPress: () => void;
  isSending: boolean;
}) {
  const name = conv.other_display_name ?? `@${conv.other_username}` ?? 'User';
  const initital = (conv.other_username ?? '?')[0].toUpperCase();

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75} disabled={isSending}>
      <View style={[styles.avatar, conv.other_accent_color ? { borderColor: conv.other_accent_color } : undefined]}>
        {conv.other_avatar_url ? (
          <Image source={{ uri: conv.other_avatar_url }} style={styles.avatarImg} />
        ) : (
          <Text style={[styles.avatarLetter, conv.other_accent_color ? { color: conv.other_accent_color } : undefined]}>
            {initital}
          </Text>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      {isSending ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={styles.sendLabel}>Send</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#0a0a0a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: '#1a1a1a',
    paddingBottom: 40,
    maxHeight: '60%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#222',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  title: {
    fontSize: 16, fontWeight: '800', color: '#fff',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  spinner: { paddingVertical: 40 },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  empty: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: '#444', fontSize: 14 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#111',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#222', overflow: 'hidden', flexShrink: 0,
  },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarLetter: { fontSize: 16, fontWeight: '800', color: '#fff' },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: '#fff' },
  sendLabel: {
    fontSize: 13, fontWeight: '700', color: '#000',
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14,
  },
});
