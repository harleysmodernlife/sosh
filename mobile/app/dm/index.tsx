import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { api } from '@/lib/api';
import type { Conversation } from '@/lib/types';

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function DMListScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    try {
      setConversations(await api.dm.conversations());
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backTap}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={styles.backTap} />
      </View>

      <FlatList
        data={conversations}
        keyExtractor={c => c.conversation_id}
        renderItem={({ item }) => <ConvRow conv={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#fff" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✉</Text>
            <Text style={styles.emptyTitle}>No messages yet.</Text>
            <Text style={styles.emptyText}>Go to someone's profile and tap Message.</Text>
          </View>
        }
        contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : undefined}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function ConvRow({ conv }: { conv: Conversation }) {
  const name = conv.other_display_name ?? `@${conv.other_username}`;
  const preview = conv.last_message_body ?? 'No messages yet.';
  const time = conv.last_message_at ? formatTimeAgo(conv.last_message_at) : '';
  const hasUnread = conv.unread_count > 0;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/dm/${conv.conversation_id}`)}
      activeOpacity={0.8}
    >
      <View style={[styles.avatar, conv.other_accent_color ? { borderColor: conv.other_accent_color } : undefined]}>
        {conv.other_avatar_url ? (
          <Image source={{ uri: conv.other_avatar_url }} style={styles.avatarImg} />
        ) : (
          <Text style={[styles.avatarLetter, conv.other_accent_color ? { color: conv.other_accent_color } : undefined]}>
            {(conv.other_username ?? '?')[0].toUpperCase()}
          </Text>
        )}
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowName, hasUnread && styles.rowNameUnread]}>{name}</Text>
          {time ? <Text style={styles.rowTime}>{time}</Text> : null}
        </View>
        <Text style={[styles.rowPreview, hasUnread && styles.rowPreviewUnread]} numberOfLines={1}>
          {preview}
        </Text>
      </View>

      {hasUnread && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadCount}>{conv.unread_count > 9 ? '9+' : conv.unread_count}</Text>
        </View>
      )}
    </TouchableOpacity>
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
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#0d0d0d',
  },
  avatar: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: '#1a1a1a',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#222', overflow: 'hidden', flexShrink: 0,
  },
  avatarImg: { width: 50, height: 50, borderRadius: 25 },
  avatarLetter: { fontSize: 20, fontWeight: '800', color: '#fff' },

  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { fontSize: 15, fontWeight: '600', color: '#888' },
  rowNameUnread: { color: '#fff', fontWeight: '800' },
  rowTime: { fontSize: 12, color: '#333' },
  rowPreview: { fontSize: 14, color: '#333' },
  rowPreviewUnread: { color: '#666' },

  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 5,
  },
  unreadCount: { fontSize: 11, fontWeight: '900', color: '#000' },

  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 40, color: '#1a1a1a' },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#2a2a2a' },
  emptyText: { fontSize: 14, color: '#222', textAlign: 'center', lineHeight: 21 },
});
