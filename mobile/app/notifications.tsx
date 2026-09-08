import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { NotificationsSkeleton } from '@/components/Skeleton';
import type { Notification } from '@/lib/types';

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function notifIcon(type: string) {
  switch (type) {
    case 'like': return '♥';
    case 'comment': return '💬';
    case 'follow': return '◈';
    case 'trophy': return '🏆';
    case 'pulse': return '⚡';
    case 'results': return '▲';
    case 'milestone': return '▲';
    default: return '◉';
  }
}

function handleTap(notif: Notification) {
  if ((notif.type === 'like' || notif.type === 'comment') && notif.post_id) {
    router.push(`/post/${notif.post_id}`);
  } else if (notif.type === 'follow' && notif.actor_id) {
    router.push(`/user/${notif.actor_id}`);
  } else if ((notif.type === 'trophy' || notif.type === 'results') && notif.pulse_id) {
    router.push('/(tabs)/leaderboard');
  } else if (notif.type === 'pulse') {
    router.push('/(tabs)/pulse');
  } else if (notif.type === 'milestone' && notif.pulse_id) {
    router.push('/(tabs)/leaderboard');
  }
}

export default function NotificationsScreen() {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const list = await api.notifications.list();
      setNotifs(list);
      api.notifications.markAllRead().catch(() => {});
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.backTap} />
          <Text style={styles.title}>Notifications</Text>
          <View style={styles.backTap} />
        </View>
        <NotificationsSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backTap}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <View style={styles.backTap} />
      </View>

      <FlatList
        data={notifs}
        keyExtractor={n => n.id}
        renderItem={({ item }) => <NotifRow notif={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#fff" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No notifications yet.</Text>
          </View>
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function NotifRow({ notif }: { notif: Notification }) {
  return (
    <TouchableOpacity
      style={[styles.row, !notif.read && styles.rowUnread]}
      onPress={() => handleTap(notif)}
      activeOpacity={0.8}
    >
      <View style={styles.iconWrap}>
        {notif.actor_avatar_url ? (
          <View style={[styles.actorAvatar, notif.actor_accent_color ? { borderColor: notif.actor_accent_color } : undefined]}>
            <Image source={{ uri: notif.actor_avatar_url }} style={styles.actorAvatarImg} />
          </View>
        ) : (
          <View style={styles.typeIconWrap}>
            <Text style={styles.typeIcon}>{notifIcon(notif.type)}</Text>
          </View>
        )}
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.body}>{notif.body}</Text>
        <Text style={styles.time}>{formatTimeAgo(notif.created_at)}</Text>
      </View>
      {!notif.read && <View style={styles.unreadDot} />}
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
  back: { fontSize: 24, color: '#fff' },
  title: { fontSize: 15, fontWeight: '700', color: '#fff' },

  list: { paddingBottom: 48 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#0a0a0a' },
  rowUnread: { backgroundColor: '#0a0a0a' },

  iconWrap: { flexShrink: 0 },
  actorAvatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: '#333' },
  actorAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  typeIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  typeIcon: { fontSize: 20 },

  textWrap: { flex: 1, gap: 3 },
  body: { fontSize: 14, color: '#ccc', lineHeight: 20 },
  time: { fontSize: 11, color: '#444' },

  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', flexShrink: 0 },

  empty: { paddingTop: 80, alignItems: 'center' },
  emptyText: { color: '#333', fontSize: 14 },
});
