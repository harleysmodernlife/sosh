import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '@/lib/api';
import type { Post } from '@/lib/types';

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function HashtagFeedScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const LIMIT = 20;

  async function load(currentOffset: number, replace: boolean) {
    if (replace) setLoading(true);
    else setLoadingMore(true);
    try {
      const page = await api.posts.byHashtag(tag, currentOffset, LIMIT);
      if (replace) {
        setPosts(page);
      } else {
        setPosts(prev => [...prev, ...page]);
      }
      setHasMore(page.length === LIMIT);
      setOffset(currentOffset + page.length);
    } catch {}
    finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (tag) load(0, true);
  }, [tag]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    load(offset, false);
  }, [hasMore, loadingMore, loading, offset]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backTap}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          <Text style={styles.hashSymbol}>#</Text>{tag}
        </Text>
        <View style={styles.backTap} />
      </View>

      <FlatList
        data={posts}
        keyExtractor={p => p.id}
        renderItem={({ item }) => <PostRow post={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ActivityIndicator color="#333" style={styles.footer} /> : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No posts with #{tag} yet.</Text>
          </View>
        }
      />
    </View>
  );
}

function PostRow({ post }: { post: Post }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/post/${post.id}` as any)}
      activeOpacity={0.85}
    >
      <View style={[styles.avatar, post.accent_color ? { borderColor: post.accent_color } : undefined]}>
        {post.avatar_url ? (
          <Image source={{ uri: post.avatar_url }} style={styles.avatarImg} />
        ) : (
          <Text style={[styles.avatarLetter, post.accent_color ? { color: post.accent_color } : undefined]}>
            {(post.username ?? '?')[0].toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.info}>
        <View style={styles.meta}>
          <Text style={styles.author}>{post.display_name ?? `@${post.username}`}</Text>
          <Text style={styles.time}>{formatTimeAgo(post.created_at)}</Text>
        </View>
        {post.text_content ? (
          <Text style={styles.body} numberOfLines={3}>{post.text_content}</Text>
        ) : post.caption ? (
          <Text style={styles.body} numberOfLines={3}>{post.caption}</Text>
        ) : (
          <Text style={styles.bodyMuted}>[{post.content_type}]</Text>
        )}
        <View style={styles.stats}>
          <Text style={styles.stat}>♥ {post.like_count}</Text>
          <Text style={styles.stat}>💬 {post.comment_count}</Text>
        </View>
      </View>
      {post.content_type !== 'text' && post.media_url && (
        <Image source={{ uri: post.media_url }} style={styles.thumb} resizeMode="cover" />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#111',
  },
  backTap: { width: 44, height: 44, justifyContent: 'center' },
  backArrow: { fontSize: 24, color: '#fff' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '900', color: '#fff' },
  hashSymbol: { color: '#06D6A0' },

  list: { paddingBottom: 60 },
  footer: { paddingVertical: 20 },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#0d0d0d',
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#1a1a1a',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#222', overflow: 'hidden', flexShrink: 0,
  },
  avatarImg: { width: 38, height: 38, borderRadius: 19 },
  avatarLetter: { fontSize: 15, fontWeight: '800', color: '#fff' },
  info: { flex: 1, gap: 4 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  author: { fontSize: 13, fontWeight: '700', color: '#fff' },
  time: { fontSize: 11, color: '#333' },
  body: { fontSize: 14, color: '#bbb', lineHeight: 20 },
  bodyMuted: { fontSize: 13, color: '#444', fontStyle: 'italic' },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { fontSize: 12, color: '#333', fontWeight: '600' },
  thumb: { width: 56, height: 56, borderRadius: 8, flexShrink: 0 },

  empty: { paddingTop: 80, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#333' },
});
