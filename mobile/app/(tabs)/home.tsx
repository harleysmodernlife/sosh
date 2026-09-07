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
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { api } from '@/lib/api';
import type { Pulse, Post, FeedEntry } from '@/lib/types';
import { useCountdown } from '@/components/useCountdown';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PAGE = 20;

type FeedItem =
  | { kind: 'post'; data: Post; ts: number }
  | { kind: 'entry'; data: FeedEntry; ts: number };

function merge(posts: Post[], entries: FeedEntry[]): FeedItem[] {
  const a: FeedItem[] = posts.map(p => ({ kind: 'post', data: p, ts: new Date(p.created_at).getTime() }));
  const b: FeedItem[] = entries.map(e => ({ kind: 'entry', data: e, ts: new Date(e.created_at).getTime() }));
  return [...a, ...b].sort((x, y) => y.ts - x.ts);
}

export default function HomeScreen() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [postOffset, setPostOffset] = useState(0);
  const [entryOffset, setEntryOffset] = useState(0);
  const [postsEnd, setPostsEnd] = useState(false);
  const [entriesEnd, setEntriesEnd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const loadingMore = useRef(false);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    setVisibleKeys(new Set(viewableItems.map(v => v.key)));
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  async function load() {
    try {
      const [p, posts, entries] = await Promise.all([
        api.pulses.active(),
        api.posts.feed(0, PAGE),
        api.feed.get(0, PAGE),
      ]);
      setPulse(p);
      setItems(merge(posts, entries));
      setPostOffset(posts.length);
      setEntryOffset(entries.length);
      setPostsEnd(posts.length < PAGE);
      setEntriesEnd(entries.length < PAGE);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => {
    api.pulses.active().then(setPulse).catch(() => {});
    if (items.length === 0) load();
  }, [items.length]));

  async function refresh() {
    setRefreshing(true);
    setPostsEnd(false);
    setEntriesEnd(false);
    await load();
  }

  async function loadMore() {
    if (moreLoading || loadingMore.current || (postsEnd && entriesEnd)) return;
    loadingMore.current = true;
    setMoreLoading(true);
    try {
      const [morePosts, moreEntries] = await Promise.all([
        postsEnd ? Promise.resolve([]) : api.posts.feed(postOffset, PAGE),
        entriesEnd ? Promise.resolve([]) : api.feed.get(entryOffset, PAGE),
      ]);
      if (morePosts.length === 0 && moreEntries.length === 0) {
        setPostsEnd(true);
        setEntriesEnd(true);
      } else {
        setItems(prev => [...prev, ...merge(morePosts as Post[], moreEntries as FeedEntry[])]);
        setPostOffset(prev => prev + morePosts.length);
        setEntryOffset(prev => prev + moreEntries.length);
        if ((morePosts as Post[]).length < PAGE) setPostsEnd(true);
        if ((moreEntries as FeedEntry[]).length < PAGE) setEntriesEnd(true);
      }
    } catch {}
    finally {
      setMoreLoading(false);
      loadingMore.current = false;
    }
  }

  function handleLikeUpdate(postId: string, liked: boolean, count: number) {
    setItems(prev => prev.map(item =>
      item.kind === 'post' && item.data.id === postId
        ? { ...item, data: { ...item.data, viewer_has_liked: liked, like_count: count } }
        : item
    ));
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>;
  }

  const allEnd = postsEnd && entriesEnd;

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={item => `${item.kind}-${item.data.id}`}
        renderItem={({ item }) => {
          const key = `${item.kind}-${item.data.id}`;
          return item.kind === 'post'
            ? <PostCard post={item.data} onLikeUpdate={handleLikeUpdate} isVisible={visibleKeys.has(key)} />
            : <EntryCard entry={item.data} isVisible={visibleKeys.has(key)} />;
        }}
        ListHeaderComponent={<Header pulse={pulse} />}
        ListEmptyComponent={
          <View style={styles.emptyFeed}>
            <Text style={styles.emptyIcon}>◉</Text>
            <Text style={styles.emptyTitle}>Nothing here yet.</Text>
            <Text style={styles.emptyText}>Be the first to post something.</Text>
            <TouchableOpacity style={styles.emptyCompose} onPress={() => router.push('/compose')}>
              <Text style={styles.emptyComposeText}>Make a post</Text>
            </TouchableOpacity>
          </View>
        }
        ListFooterComponent={
          moreLoading ? (
            <View style={styles.footerLoader}><ActivityIndicator color="#333" /></View>
          ) : allEnd && items.length > 0 ? (
            <Text style={styles.feedEnd}>You're all caught up.</Text>
          ) : null
        }
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        style={styles.flatList}
      />
    </View>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header({ pulse }: { pulse: Pulse | null }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text style={styles.wordmark}>SÖSH</Text>
        <TouchableOpacity style={styles.composeBtn} onPress={() => router.push('/compose')}>
          <Text style={styles.composeBtnText}>+</Text>
        </TouchableOpacity>
      </View>
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
          {countdown && <Text style={styles.pulseCountdown}>{countdown}</Text>}
        </View>
        <Text style={styles.pulsePrompt}>"{pulse.prompt}"</Text>
        <Text style={styles.pulseCta}>
          {pulse.status === 'active' ? 'Tap to respond →' : 'Tap to vote →'}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onLikeUpdate,
  isVisible,
}: {
  post: Post;
  onLikeUpdate: (id: string, liked: boolean, count: number) => void;
  isVisible: boolean;
}) {
  const [liked, setLiked] = useState(post.viewer_has_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [inFlight, setInFlight] = useState(false);

  async function toggleLike() {
    if (inFlight) return;
    setInFlight(true);
    const wasLiked = liked;
    const newCount = likeCount + (wasLiked ? -1 : 1);
    setLiked(!wasLiked);
    setLikeCount(newCount);
    onLikeUpdate(post.id, !wasLiked, newCount);
    try {
      if (wasLiked) await api.posts.unlike(post.id);
      else await api.posts.like(post.id);
    } catch {
      setLiked(wasLiked);
      setLikeCount(likeCount);
      onLikeUpdate(post.id, wasLiked, likeCount);
    } finally {
      setInFlight(false);
    }
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardAuthor}
        onPress={() => router.push(`/user/${post.user_id}`)}
        activeOpacity={0.8}
      >
        <View style={[styles.postAvatar, post.accent_color ? { borderColor: post.accent_color } : undefined]}>
          {post.avatar_url ? (
            <Image source={{ uri: post.avatar_url }} style={styles.postAvatarImg} />
          ) : (
            <Text style={[styles.postAvatarLetter, post.accent_color ? { color: post.accent_color } : undefined]}>
              {(post.username ?? '?')[0].toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.cardAuthorInfo}>
          <Text style={styles.cardName}>{post.display_name ?? `@${post.username}`}</Text>
          <Text style={styles.cardTime}>{formatTimeAgo(post.created_at)}</Text>
        </View>
      </TouchableOpacity>

      {post.content_type !== 'text' && post.media_url ? (
        <MediaView uri={post.media_url} type={post.content_type} style={styles.cardImage} isVisible={isVisible} />
      ) : post.text_content ? (
        <View style={styles.cardTextBox}>
          <Text style={styles.cardText}>{post.text_content}</Text>
        </View>
      ) : null}

      {post.caption ? <Text style={styles.cardCaption} numberOfLines={3}>{post.caption}</Text> : null}

      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.likeBtn} onPress={toggleLike} activeOpacity={0.7}>
          <Text style={[styles.likeIcon, liked && styles.likeIconActive]}>♥</Text>
          <Text style={[styles.likeCount, liked && styles.likeCountActive]}>{likeCount}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Pulse entry card ─────────────────────────────────────────────────────────

function EntryCard({ entry, isVisible }: { entry: FeedEntry; isVisible: boolean }) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/user/${entry.user_id}`)}
      activeOpacity={0.9}
    >
      <View style={styles.entryPulseRow}>
        <Text style={styles.entryPulseLabel}>PULSE</Text>
        {entry.pulse_city && <Text style={styles.entryPulseCity}>{entry.pulse_city}</Text>}
        <Text style={styles.entryPulseTime}>{formatTimeAgo(entry.created_at)}</Text>
      </View>
      <Text style={styles.entryPrompt} numberOfLines={2}>"{entry.pulse_prompt}"</Text>

      {entry.media_url ? (
        <MediaView uri={entry.media_url} type={entry.content_type} style={styles.cardImage} isVisible={isVisible} />
      ) : entry.text_content ? (
        <View style={styles.cardTextBox}>
          <Text style={styles.cardText}>{entry.text_content}</Text>
        </View>
      ) : null}

      <View style={styles.cardFooter}>
        <Text style={styles.cardName}>{entry.display_name ?? `@${entry.username}`}</Text>
        <Text style={styles.entryVotes}>▲ {entry.vote_count}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Shared media renderer ────────────────────────────────────────────────────

function MediaView({ uri, type, style, isVisible }: { uri: string; type: string; style: object; isVisible: boolean }) {
  const [paused, setPaused] = useState(false);
  const playing = isVisible && !paused;

  if (type === 'video') {
    return (
      <TouchableOpacity onPress={() => setPaused(p => !p)} activeOpacity={1} style={style}>
        <Video
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={playing}
          isLooping
          useNativeControls={false}
        />
        {!playing && (
          <View style={styles.pauseOverlay}>
            <Text style={styles.pauseIcon}>▶</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }
  return <Image source={{ uri }} style={style} resizeMode="cover" />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  flatList: { backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  list: { paddingBottom: 48, backgroundColor: '#000' },

  header: { paddingTop: 56, gap: 12, marginBottom: 8 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  wordmark: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 6 },
  composeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  composeBtnText: { fontSize: 22, fontWeight: '300', color: '#000', lineHeight: 26 },

  quietBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#111' },
  quietDot: { fontSize: 12, color: '#282828' },
  quietText: { fontSize: 12, color: '#2a2a2a', fontWeight: '600', letterSpacing: 0.3 },

  pulseBanner: { marginHorizontal: 16, borderRadius: 16, padding: 20, gap: 10 },
  pulseBannerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pulseLiveLabel: { fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  pulseCountdown: { fontSize: 20, fontWeight: '900', color: '#fff', fontVariant: ['tabular-nums'] },
  pulsePrompt: { fontSize: 22, fontWeight: '700', color: '#fff', lineHeight: 28 },
  pulseCta: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '700' },

  card: { borderBottomWidth: 1, borderBottomColor: '#111', paddingBottom: 16, marginTop: 16, gap: 12 },

  // Post card
  cardAuthor: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  postAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333', overflow: 'hidden' },
  postAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  postAvatarLetter: { fontSize: 17, fontWeight: '800', color: '#fff' },
  cardAuthorInfo: { flex: 1, gap: 1 },
  cardName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  cardTime: { fontSize: 11, color: '#444' },
  cardImage: { width: SCREEN_WIDTH, aspectRatio: 4 / 3 },
  cardTextBox: { marginHorizontal: 16, backgroundColor: '#0d0d0d', borderRadius: 12, padding: 18, borderWidth: 1, borderColor: '#1a1a1a' },
  cardText: { fontSize: 20, color: '#fff', lineHeight: 28, fontWeight: '500' },
  cardCaption: { fontSize: 14, color: '#888', paddingHorizontal: 16, lineHeight: 20 },
  cardActions: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 4 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  likeIcon: { fontSize: 20, color: '#333' },
  likeIconActive: { color: '#e63946' },
  likeCount: { fontSize: 13, fontWeight: '700', color: '#333' },
  likeCountActive: { color: '#e63946' },

  // Entry card
  entryPulseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  entryPulseLabel: { fontSize: 10, fontWeight: '800', color: '#333', letterSpacing: 2 },
  entryPulseCity: { fontSize: 10, color: '#333', fontWeight: '600' },
  entryPulseTime: { fontSize: 10, color: '#2a2a2a', marginLeft: 'auto' },
  entryPrompt: { fontSize: 13, color: '#555', lineHeight: 19, paddingHorizontal: 16, fontStyle: 'italic' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  entryVotes: { fontSize: 13, fontWeight: '700', color: '#333' },

  pauseOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  pauseIcon: { fontSize: 48, color: 'rgba(255,255,255,0.9)' },

  emptyFeed: { alignItems: 'center', paddingTop: 60, gap: 14, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 40, color: '#1a1a1a' },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#2a2a2a' },
  emptyText: { fontSize: 14, color: '#222', textAlign: 'center', lineHeight: 21 },
  emptyCompose: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, backgroundColor: '#fff' },
  emptyComposeText: { fontSize: 14, fontWeight: '700', color: '#000' },
  footerLoader: { paddingVertical: 24, alignItems: 'center' },
  feedEnd: { textAlign: 'center', color: '#222', fontSize: 12, paddingVertical: 24 },
});
