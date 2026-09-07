import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
  Dimensions,
  Modal,
  ScrollView,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '@/lib/api';
import type { Pulse, FeedEntry } from '@/lib/types';
import { useCountdown } from '@/components/useCountdown';

const SCREEN_WIDTH = Dimensions.get('window').width;
const FEED_LIMIT = 10;

export default function HomeScreen() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [offset, setOffset] = useState(0);
  const [feedEnd, setFeedEnd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<FeedEntry | null>(null);
  const loadingMore = useRef(false);

  async function load() {
    try {
      const [p, entries] = await Promise.all([
        api.pulses.active(),
        api.feed.get(0, FEED_LIMIT),
      ]);
      setPulse(p);
      setFeed(entries);
      setOffset(entries.length);
      setFeedEnd(entries.length < FEED_LIMIT);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => {
    // On focus, just refresh active pulse — don't reset the scroll
    api.pulses.active().then(setPulse).catch(() => {});
    if (feed.length === 0) load();
  }, [feed.length]));

  async function refresh() {
    setRefreshing(true);
    setFeedEnd(false);
    await load();
  }

  async function loadMore() {
    if (feedLoading || feedEnd || loadingMore.current) return;
    loadingMore.current = true;
    setFeedLoading(true);
    try {
      const entries = await api.feed.get(offset, FEED_LIMIT);
      if (entries.length === 0) {
        setFeedEnd(true);
      } else {
        setFeed(prev => [...prev, ...entries]);
        setOffset(prev => prev + entries.length);
        if (entries.length < FEED_LIMIT) setFeedEnd(true);
      }
    } catch {}
    finally {
      setFeedLoading(false);
      loadingMore.current = false;
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>;
  }

  return (
    <>
      <FlatList
        data={feed}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <FeedCard entry={item} onPress={() => setSelected(item)} />
        )}
        ListHeaderComponent={
          <Header pulse={pulse} />
        }
        ListEmptyComponent={
          <View style={styles.emptyFeed}>
            <Text style={styles.emptyIcon}>◉</Text>
            <Text style={styles.emptyTitle}>Nothing yet.</Text>
            <Text style={styles.emptyText}>
              Content will appear here after the first Pulse resolves.
            </Text>
          </View>
        }
        ListFooterComponent={
          feedLoading ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color="#333" />
            </View>
          ) : feedEnd && feed.length > 0 ? (
            <Text style={styles.feedEnd}>You're all caught up.</Text>
          ) : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      {selected && (
        <EntryModal entry={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function Header({ pulse }: { pulse: Pulse | null }) {
  return (
    <View style={styles.header}>
      <Text style={styles.wordmark}>SÖSH</Text>
      {pulse && (pulse.status === 'active' || pulse.status === 'voting') ? (
        <PulseBanner pulse={pulse} />
      ) : (
        <View style={styles.quietBar}>
          <Text style={styles.quietDot}>◉</Text>
          <Text style={styles.quietText}>Signal quiet — Pulse fires without warning</Text>
        </View>
      )}
    </View>
  );
}

function PulseBanner({ pulse }: { pulse: Pulse }) {
  const endsAt = pulse.status === 'active' ? pulse.submission_ends_at : pulse.voting_ends_at;
  const countdown = useCountdown(endsAt);

  return (
    <TouchableOpacity onPress={() => router.push('/(tabs)/pulse')} activeOpacity={0.9}>
      <LinearGradient
        colors={pulse.status === 'active' ? ['#ff4444', '#aa0000'] : ['#ff8800', '#bb5500']}
        style={styles.pulseBanner}
      >
        <View style={styles.pulseBannerTop}>
          <Text style={styles.pulseLiveLabel}>
            {pulse.status === 'active' ? '⚡ PULSE IS LIVE' : '🗳 VOTING OPEN'}
          </Text>
          {countdown && (
            <Text style={styles.pulseCountdown}>{countdown}</Text>
          )}
        </View>
        <Text style={styles.pulsePrompt}>"{pulse.prompt}"</Text>
        <Text style={styles.pulseCta}>
          {pulse.status === 'active' ? 'Tap to respond →' : 'Tap to vote →'}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function FeedCard({ entry, onPress }: { entry: FeedEntry; onPress: () => void }) {
  const timeAgo = formatTimeAgo(entry.created_at);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      {/* Pulse context label */}
      <View style={styles.cardPulseRow}>
        <Text style={styles.cardPulseLabel}>PULSE</Text>
        {entry.pulse_city && <Text style={styles.cardPulseCity}>{entry.pulse_city}</Text>}
        <Text style={styles.cardPulseTime}>{timeAgo}</Text>
      </View>
      <Text style={styles.cardPrompt} numberOfLines={2}>"{entry.pulse_prompt}"</Text>

      {/* Entry content */}
      {entry.media_url ? (
        <Image
          source={{ uri: entry.media_url }}
          style={styles.cardImage}
          resizeMode="cover"
        />
      ) : entry.text_content ? (
        <View style={styles.cardTextBox}>
          <Text style={styles.cardText}>{entry.text_content}</Text>
        </View>
      ) : null}

      {/* Attribution */}
      <View style={styles.cardFooter}>
        <View>
          <Text style={styles.cardName}>
            {entry.display_name ?? `@${entry.username}`}
          </Text>
          {entry.city && <Text style={styles.cardCity}>{entry.city}</Text>}
        </View>
        <Text style={styles.cardVotes}>▲ {entry.vote_count}</Text>
      </View>
    </TouchableOpacity>
  );
}

function EntryModal({ entry, onClose }: { entry: FeedEntry; onClose: () => void }) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalClose}>Close</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { onClose(); router.push(`/user/${entry.user_id}`); }}>
            <Text style={styles.modalUsername}>
              {entry.display_name ?? `@${entry.username}`} →
            </Text>
            {entry.display_name && (
              <Text style={styles.modalHandle}>@{entry.username}</Text>
            )}
          </TouchableOpacity>
          <View style={{ width: 48 }} />
        </View>

        <ScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalPromptLabel}>PULSE</Text>
          <Text style={styles.modalPrompt}>"{entry.pulse_prompt}"</Text>

          {entry.media_url ? (
            <Image
              source={{ uri: entry.media_url }}
              style={[styles.modalImage, { width: SCREEN_WIDTH - 40 }]}
              resizeMode="cover"
            />
          ) : entry.text_content ? (
            <View style={styles.modalTextBox}>
              <Text style={styles.modalText}>{entry.text_content}</Text>
            </View>
          ) : null}

          <View style={styles.modalMeta}>
            {entry.city && <Text style={styles.modalCity}>{entry.city}</Text>}
            <Text style={styles.modalVotes}>▲ {entry.vote_count} votes</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  list: { paddingBottom: 48 },

  // Header
  header: { paddingTop: 56, gap: 12, marginBottom: 8 },
  wordmark: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 6, paddingHorizontal: 20 },

  // Quiet bar
  quietBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#111' },
  quietDot: { fontSize: 12, color: '#282828' },
  quietText: { fontSize: 12, color: '#2a2a2a', fontWeight: '600', letterSpacing: 0.3 },

  // Pulse banner
  pulseBanner: { marginHorizontal: 16, borderRadius: 16, padding: 20, gap: 10 },
  pulseBannerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pulseLiveLabel: { fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  pulseCountdown: { fontSize: 20, fontWeight: '900', color: '#fff', fontVariant: ['tabular-nums'] },
  pulsePrompt: { fontSize: 22, fontWeight: '700', color: '#fff', lineHeight: 28 },
  pulseCta: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '700' },

  // Feed
  card: {
    borderBottomWidth: 1,
    borderBottomColor: '#111',
    paddingBottom: 20,
    marginTop: 20,
    gap: 10,
  },
  cardPulseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  cardPulseLabel: { fontSize: 10, fontWeight: '800', color: '#333', letterSpacing: 2 },
  cardPulseCity: { fontSize: 10, color: '#333', fontWeight: '600' },
  cardPulseTime: { fontSize: 10, color: '#2a2a2a', marginLeft: 'auto' },
  cardPrompt: { fontSize: 13, color: '#555', lineHeight: 19, paddingHorizontal: 20, fontStyle: 'italic' },
  cardImage: { width: SCREEN_WIDTH, aspectRatio: 4 / 3 },
  cardTextBox: { marginHorizontal: 20, backgroundColor: '#0d0d0d', borderRadius: 12, padding: 18, borderWidth: 1, borderColor: '#1a1a1a' },
  cardText: { fontSize: 20, color: '#fff', lineHeight: 28, fontWeight: '500' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20 },
  cardName: { fontSize: 14, fontWeight: '700', color: '#888' },
  cardCity: { fontSize: 12, color: '#3a3a3a', marginTop: 1 },
  cardVotes: { fontSize: 13, fontWeight: '700', color: '#333' },

  // Empty + footer
  emptyFeed: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 40, color: '#1a1a1a' },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#2a2a2a' },
  emptyText: { fontSize: 14, color: '#222', textAlign: 'center', lineHeight: 21 },
  footerLoader: { paddingVertical: 24, alignItems: 'center' },
  feedEnd: { textAlign: 'center', color: '#222', fontSize: 12, paddingVertical: 24 },

  // Entry modal
  modal: { flex: 1, backgroundColor: '#000' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#111' },
  modalClose: { color: '#555', fontSize: 15, width: 48 },
  modalUsername: { fontSize: 15, fontWeight: '800', color: '#fff', textAlign: 'center' },
  modalHandle: { fontSize: 11, color: '#555', textAlign: 'center', marginTop: 1 },
  modalContent: { padding: 20, gap: 14, paddingBottom: 40 },
  modalPromptLabel: { fontSize: 10, fontWeight: '800', color: '#333', letterSpacing: 2 },
  modalPrompt: { fontSize: 15, color: '#666', fontStyle: 'italic', lineHeight: 22 },
  modalImage: { aspectRatio: 4 / 3, borderRadius: 12 },
  modalTextBox: { backgroundColor: '#0f0f0f', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#1a1a1a' },
  modalText: { fontSize: 22, color: '#fff', lineHeight: 32, fontWeight: '500' },
  modalMeta: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  modalCity: { fontSize: 13, color: '#444' },
  modalVotes: { fontSize: 13, color: '#444', fontWeight: '600' },
});
