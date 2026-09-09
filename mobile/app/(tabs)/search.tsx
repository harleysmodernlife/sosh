import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import type { User, Post } from '@/lib/types';

type Tab = 'people' | 'posts';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COL = 3;
const TILE_SIZE = Math.floor(SCREEN_WIDTH / GRID_COL) - 1;

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('people');
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [suggested, setSuggested] = useState<User[]>([]);
  const [trendingTags, setTrendingTags] = useState<{ tag: string; post_count: number }[]>([]);
  const [explorePosts, setExplorePosts] = useState<Post[]>([]);
  const [loadingExplore, setLoadingExplore] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.users.suggested().then(setSuggested).catch(() => {});
    api.posts.trendingHashtags().then(setTrendingTags).catch(() => {});
    setLoadingExplore(true);
    api.posts.feed(0, 60, 'foryou')
      .then(all => setExplorePosts(all.filter(p => p.content_type !== 'text' && !!p.media_url)))
      .catch(() => {})
      .finally(() => setLoadingExplore(false));
  }, []);

  const runSearch = useCallback((q: string, activeTab: Tab) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setUsers([]);
      setPosts([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        if (activeTab === 'people') {
          setUsers(await api.users.search(q.trim()));
        } else {
          setPosts(await api.posts.search(q.trim()));
        }
        setSearched(true);
      } catch {
        setUsers([]);
        setPosts([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, []);

  function onChangeText(text: string) {
    setQuery(text);
    runSearch(text, tab);
  }

  function switchTab(t: Tab) {
    setTab(t);
    setSearched(false);
    if (query.trim()) runSearch(query, t);
  }

  const noResults = searched && !loading && (tab === 'people' ? users.length === 0 : posts.length === 0);
  const isIdle = !query.trim();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.inputWrap}>
          <Text style={styles.searchIcon}>◎</Text>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={onChangeText}
            placeholder={tab === 'people' ? 'Search people...' : 'Search posts...'}
            placeholderTextColor="#444"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {loading && <ActivityIndicator style={styles.spinner} color="#555" size="small" />}
        </View>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'people' && styles.tabBtnActive]}
            onPress={() => switchTab('people')}
          >
            <Text style={[styles.tabText, tab === 'people' && styles.tabTextActive]}>People</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'posts' && styles.tabBtnActive]}
            onPress={() => switchTab('posts')}
          >
            <Text style={[styles.tabText, tab === 'posts' && styles.tabTextActive]}>Posts</Text>
          </TouchableOpacity>
        </View>
      </View>

      {tab === 'people' ? (
        <FlatList
          data={isIdle ? suggested : users}
          keyExtractor={u => u.id}
          renderItem={({ item }) => <UserRow user={item} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListHeaderComponent={isIdle && suggested.length > 0
            ? <Text style={styles.sectionHeader}>WHO TO FOLLOW</Text>
            : null}
          ListEmptyComponent={<PeopleEmpty noResults={noResults} query={query} />}
          showsVerticalScrollIndicator={false}
        />
      ) : isIdle ? (
        <ExploreGrid
          trendingTags={trendingTags}
          posts={explorePosts}
          loading={loadingExplore}
        />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={p => p.id}
          renderItem={({ item }) => <PostRow post={item} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            noResults ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No posts found.</Text>
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─── Explore Grid ────────────────────────────────────────────────────────────

function ExploreGrid({
  trendingTags,
  posts,
  loading,
}: {
  trendingTags: { tag: string; post_count: number }[];
  posts: Post[];
  loading: boolean;
}) {
  const Header = (
    <>
      {trendingTags.length > 0 && (
        <View style={styles.tagsSection}>
          <Text style={styles.sectionHeader}>TRENDING TAGS</Text>
          <View style={styles.tagChips}>
            {trendingTags.map(({ tag, post_count }) => (
              <TouchableOpacity
                key={tag}
                style={styles.tagChip}
                onPress={() => router.push(`/hashtag/${tag}` as any)}
                activeOpacity={0.7}
              >
                <Text style={styles.tagChipText}>#{tag}</Text>
                <Text style={styles.tagChipCount}>{post_count}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      {posts.length > 0 && <Text style={[styles.sectionHeader, { paddingTop: 20 }]}>DISCOVER</Text>}
    </>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#333" />
      </View>
    );
  }

  if (posts.length === 0 && trendingTags.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyHint}>Posts and trending tags will appear here.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={p => p.id}
      numColumns={GRID_COL}
      renderItem={({ item }) => <GridTile post={item} />}
      ListHeaderComponent={Header}
      contentContainerStyle={styles.gridContent}
      showsVerticalScrollIndicator={false}
      columnWrapperStyle={styles.gridRow}
    />
  );
}

function GridTile({ post }: { post: Post }) {
  return (
    <TouchableOpacity
      style={styles.gridTile}
      onPress={() => router.push(`/post/${post.id}` as any)}
      activeOpacity={0.85}
    >
      <Image source={{ uri: post.media_url! }} style={styles.gridTileImg} resizeMode="cover" />
      {post.content_type === 'video' && (
        <View style={styles.gridVideobadge}>
          <Text style={styles.gridVideobadgeText}>▶</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── People Empty ─────────────────────────────────────────────────────────────

function PeopleEmpty({ noResults, query }: { noResults: boolean; query: string }) {
  if (noResults) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No people found.</Text>
      </View>
    );
  }
  if (!query.trim()) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyHint}>Find people by username or display name.</Text>
      </View>
    );
  }
  return null;
}

// ─── Row components ───────────────────────────────────────────────────────────

function UserRow({ user }: { user: User }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/user/${user.id}`)}
      activeOpacity={0.8}
    >
      <View style={[styles.avatar, user.accent_color ? { borderColor: user.accent_color } : undefined]}>
        {user.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} />
        ) : (
          <Text style={[styles.avatarLetter, user.accent_color ? { color: user.accent_color } : undefined]}>
            {(user.username ?? '?')[0].toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{user.display_name ?? `@${user.username}`}</Text>
        {user.display_name && user.username ? <Text style={styles.handle}>@{user.username}</Text> : null}
        {user.city ? <Text style={styles.city}>{user.city}</Text> : null}
      </View>
      <View style={styles.score}>
        <Text style={[styles.scoreValue, user.accent_color ? { color: user.accent_color } : undefined]}>
          {user.sosh_score}
        </Text>
        <Text style={styles.scoreLabel}>pts</Text>
      </View>
    </TouchableOpacity>
  );
}

function PostRow({ post }: { post: Post }) {
  return (
    <TouchableOpacity
      style={styles.postRow}
      onPress={() => router.push(`/post/${post.id}`)}
      activeOpacity={0.8}
    >
      <View style={[styles.postAvatar, post.accent_color ? { borderColor: post.accent_color } : undefined]}>
        {post.avatar_url ? (
          <Image source={{ uri: post.avatar_url }} style={styles.postAvatarImg} />
        ) : (
          <Text style={[styles.avatarLetter, post.accent_color ? { color: post.accent_color } : undefined]}>
            {(post.username ?? '?')[0].toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.postInfo}>
        <View style={styles.postMeta}>
          <Text style={styles.postAuthor}>{post.display_name ?? `@${post.username}`}</Text>
          <Text style={styles.postTime}>{formatTimeAgo(post.created_at)}</Text>
        </View>
        {post.text_content ? (
          <Text style={styles.postBody} numberOfLines={2}>{post.text_content}</Text>
        ) : post.caption ? (
          <Text style={styles.postBody} numberOfLines={2}>{post.caption}</Text>
        ) : (
          <Text style={styles.postBodyMuted}>[{post.content_type}]</Text>
        )}
        <View style={styles.postStats}>
          <Text style={styles.postStat}>♥ {post.like_count}</Text>
          <Text style={styles.postStat}>💬 {post.comment_count}</Text>
        </View>
      </View>
      {post.content_type !== 'text' && post.media_url && (
        <Image source={{ uri: post.media_url }} style={styles.postThumb} resizeMode="cover" />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },

  header: { paddingTop: 60, paddingHorizontal: 20, gap: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#111' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 14, paddingHorizontal: 14, gap: 8 },
  searchIcon: { fontSize: 16, color: '#444' },
  input: { flex: 1, height: 44, fontSize: 16, color: '#fff' },
  spinner: { marginRight: 4 },

  tabs: { flexDirection: 'row', gap: 6 },
  tabBtn: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: '#1a1a1a' },
  tabBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#444' },
  tabTextActive: { color: '#000' },

  list: { paddingTop: 8, paddingBottom: 40 },

  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#333', letterSpacing: 2, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },

  // Trending tags
  tagsSection: { paddingTop: 8 },
  tagChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingTop: 4 },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#0d1a14', borderWidth: 1, borderColor: '#06D6A0',
  },
  tagChipText: { fontSize: 14, fontWeight: '700', color: '#06D6A0' },
  tagChipCount: { fontSize: 11, color: '#2a5a45', fontWeight: '600' },

  // Grid
  gridContent: { paddingBottom: 60 },
  gridRow: { gap: 1 },
  gridTile: { width: TILE_SIZE, height: TILE_SIZE, backgroundColor: '#111', marginBottom: 1 },
  gridTileImg: { width: TILE_SIZE, height: TILE_SIZE },
  gridVideobadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  gridVideobadgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },

  // People
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#0d0d0d' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#222', overflow: 'hidden', flexShrink: 0 },
  avatarImg: { width: 46, height: 46, borderRadius: 23 },
  avatarLetter: { fontSize: 18, fontWeight: '800', color: '#fff' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: '#fff' },
  handle: { fontSize: 12, color: '#555' },
  city: { fontSize: 12, color: '#444' },
  score: { alignItems: 'flex-end', gap: 1 },
  scoreValue: { fontSize: 16, fontWeight: '900', color: '#333' },
  scoreLabel: { fontSize: 10, color: '#333', fontWeight: '600' },

  // Posts search results
  postRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#0d0d0d' },
  postAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#222', overflow: 'hidden', flexShrink: 0 },
  postAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  postInfo: { flex: 1, gap: 4 },
  postMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  postAuthor: { fontSize: 13, fontWeight: '700', color: '#fff' },
  postTime: { fontSize: 11, color: '#333' },
  postBody: { fontSize: 14, color: '#888', lineHeight: 20 },
  postBodyMuted: { fontSize: 13, color: '#444', fontStyle: 'italic' },
  postStats: { flexDirection: 'row', gap: 12 },
  postStat: { fontSize: 12, color: '#333', fontWeight: '600' },
  postThumb: { width: 54, height: 54, borderRadius: 8, flexShrink: 0 },

  empty: { paddingTop: 60, alignItems: 'center' },
  emptyText: { color: '#333', fontSize: 14 },
  emptyHint: { color: '#2a2a2a', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
