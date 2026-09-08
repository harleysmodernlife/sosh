import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
  Modal,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '@/lib/api';
import type { User, UserSummary, Trophy, Post } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_CELL = Math.floor(SCREEN_WIDTH / 3);

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [followInFlight, setFollowInFlight] = useState(false);
  const [blockInFlight, setBlockInFlight] = useState(false);
  const [followList, setFollowList] = useState<{ mode: 'followers' | 'following'; users: UserSummary[] } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [u, t, p] = await Promise.all([
          api.users.get(id),
          api.trophies.forUser(id),
          api.posts.forUser(id),
        ]);
        setUser(u);
        setTrophies(t);
        setPosts(p);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id]);

  async function toggleFollow() {
    if (!user || followInFlight) return;
    setFollowInFlight(true);
    const wasFollowing = user.viewer_is_following;
    setUser(u => u ? {
      ...u,
      viewer_is_following: !wasFollowing,
      follower_count: u.follower_count + (wasFollowing ? -1 : 1),
    } : u);
    try {
      if (wasFollowing) {
        await api.users.unfollow(id);
      } else {
        await api.users.follow(id);
      }
    } catch {
      setUser(u => u ? {
        ...u,
        viewer_is_following: wasFollowing,
        follower_count: u.follower_count + (wasFollowing ? 1 : -1),
      } : u);
    } finally {
      setFollowInFlight(false);
    }
  }

  async function toggleBlock() {
    if (!user || blockInFlight) return;
    const wasBlocked = user.viewer_has_blocked;
    if (!wasBlocked) {
      Alert.alert(
        `Block @${user.username}?`,
        'They won\'t be able to follow you, and their posts won\'t appear in your feed.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Block', style: 'destructive', onPress: async () => {
            setBlockInFlight(true);
            try {
              await api.users.block(id);
              setUser(u => u ? { ...u, viewer_has_blocked: true, viewer_is_following: false } : u);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setBlockInFlight(false);
            }
          }},
        ],
      );
    } else {
      setBlockInFlight(true);
      try {
        await api.users.unblock(id);
        setUser(u => u ? { ...u, viewer_has_blocked: false } : u);
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setBlockInFlight(false);
      }
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>;
  }

  if (notFound || !user) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundText}>User not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>← Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.profileHeader}>
          <View style={[styles.avatar, user.accent_color ? { borderColor: user.accent_color, borderWidth: 2 } : undefined]}>
            {user.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarLetter, user.accent_color ? { color: user.accent_color } : undefined]}>
                {(user.username ?? user.display_name ?? '?')[0].toUpperCase()}
              </Text>
            )}
          </View>
          <Text style={styles.username}>@{user.username ?? '—'}</Text>
          {user.display_name && <Text style={styles.displayName}>{user.display_name}</Text>}
          {user.city && <Text style={styles.location}>{user.city}</Text>}
          {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

          <View style={styles.profileActions}>
            {!user.viewer_has_blocked && (
              <TouchableOpacity
                style={[
                  styles.followBtn,
                  user.viewer_is_following && styles.followBtnActive,
                  !user.viewer_is_following && user.accent_color ? { borderColor: user.accent_color } : undefined,
                  user.viewer_is_following && user.accent_color ? { backgroundColor: user.accent_color, borderColor: user.accent_color } : undefined,
                ]}
                onPress={toggleFollow}
                disabled={followInFlight}
                activeOpacity={0.8}
              >
                <Text style={[styles.followBtnText, user.viewer_is_following && styles.followBtnTextActive]}>
                  {user.viewer_is_following ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
            )}
            {user.viewer_has_blocked && (
              <TouchableOpacity style={styles.blockedBtn} onPress={toggleBlock} disabled={blockInFlight} activeOpacity={0.8}>
                <Text style={styles.blockedBtnText}>Blocked</Text>
              </TouchableOpacity>
            )}
            {!user.viewer_has_blocked && (
              <TouchableOpacity
                style={styles.msgBtn}
                onPress={async () => {
                  try {
                    const { conversation_id } = await api.dm.startOrGet(user.id);
                    router.push(`/dm/${conversation_id}`);
                  } catch {}
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.msgBtnText}>DM</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.moreBtn}
              onPress={() => Alert.alert('', '', [
                !user.viewer_has_blocked
                  ? { text: `Block @${user.username}`, style: 'destructive', onPress: toggleBlock }
                  : { text: `Unblock @${user.username}`, onPress: toggleBlock },
                { text: 'Report user', style: 'destructive', onPress: () =>
                  Alert.alert('Report this user?', 'We\'ll review their account.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Report', style: 'destructive', onPress: async () => {
                      try { await api.reports.flagUser(user.id); Alert.alert('Reported', 'Thanks for letting us know.'); }
                      catch (e: any) { Alert.alert('Error', e.message); }
                    }},
                  ])
                },
                { text: 'Cancel', style: 'cancel' },
              ])}
            >
              <Text style={styles.moreBtnText}>···</Text>
            </TouchableOpacity>
          </View>
          {user.viewer_has_blocked && (
            <Text style={styles.blockedNotice}>You've blocked this user. Their posts are hidden.</Text>
          )}
        </View>

        <View style={styles.scoreRow}>
          <TouchableOpacity style={styles.statBox} onPress={async () => {
            const list = await api.users.followers(id);
            setFollowList({ mode: 'followers', users: list });
          }}>
            <Text style={styles.statValue}>{user.follower_count}</Text>
            <Text style={styles.statLabel}>FOLLOWERS</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statBox} onPress={async () => {
            const list = await api.users.following(id);
            setFollowList({ mode: 'following', users: list });
          }}>
            <Text style={styles.statValue}>{user.following_count}</Text>
            <Text style={styles.statLabel}>FOLLOWING</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{trophies.length}</Text>
            <Text style={styles.statLabel}>TROPHIES</Text>
          </View>
        </View>

        {posts.length > 0 && !user.viewer_has_blocked && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>POSTS</Text>
            <View style={styles.postsGrid}>
              {posts.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.gridCell}
                  onPress={() => setSelectedPost(p)}
                  activeOpacity={0.8}
                >
                  {p.content_type !== 'text' && p.media_url ? (
                    <Image source={{ uri: p.media_url }} style={styles.gridCellImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.gridCellText}>
                      <Text style={styles.gridCellTextContent} numberOfLines={4}>{p.text_content}</Text>
                    </View>
                  )}
                  {p.content_type === 'video' && (
                    <View style={styles.gridVideoIcon}>
                      <Text style={styles.gridVideoIconText}>▶</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TROPHY CASE</Text>
          {trophies.length === 0 ? (
            <View style={styles.emptyTrophies}>
              <Text style={styles.emptyTrophyText}>No trophies yet</Text>
            </View>
          ) : (
            trophies.map(t => <TrophyCard key={t.id} trophy={t} />)
          )}
        </View>
      </ScrollView>

      {selectedPost && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedPost(null)}>
          <View style={styles.postModalContainer}>
            <View style={styles.postModalHeader}>
              <TouchableOpacity onPress={() => setSelectedPost(null)}>
                <Text style={styles.postModalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.postModalContent}>
              {selectedPost.content_type !== 'text' && selectedPost.media_url ? (
                <Image
                  source={{ uri: selectedPost.media_url }}
                  style={{ width: SCREEN_WIDTH - 40, aspectRatio: 4 / 3, borderRadius: 12 }}
                  resizeMode="cover"
                />
              ) : selectedPost.text_content ? (
                <View style={styles.postModalTextBox}>
                  <Text style={styles.postModalText}>{selectedPost.text_content}</Text>
                </View>
              ) : null}
              {selectedPost.caption ? (
                <Text style={styles.postModalCaption}>{selectedPost.caption}</Text>
              ) : null}
              <Text style={styles.postModalMeta}>♥ {selectedPost.like_count} likes</Text>
            </ScrollView>
          </View>
        </Modal>
      )}
      {followList && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFollowList(null)}>
          <View style={styles.followModalContainer}>
            <View style={styles.followModalHeader}>
              <Text style={styles.followModalTitle}>{followList.mode === 'followers' ? 'Followers' : 'Following'}</Text>
              <TouchableOpacity onPress={() => setFollowList(null)}><Text style={styles.followModalClose}>Done</Text></TouchableOpacity>
            </View>
            <FlatList
              data={followList.users}
              keyExtractor={u => u.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.followRow}
                  onPress={() => { setFollowList(null); router.push(`/user/${item.id}`); }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.followAvatar, item.accent_color ? { borderColor: item.accent_color } : undefined]}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.followAvatarImg} />
                    ) : (
                      <Text style={[styles.followAvatarLetter, item.accent_color ? { color: item.accent_color } : undefined]}>
                        {(item.username ?? '?')[0].toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={styles.followInfo}>
                    <Text style={styles.followName}>{item.display_name ?? `@${item.username}`}</Text>
                    {item.display_name && item.username ? <Text style={styles.followHandle}>@{item.username}</Text> : null}
                  </View>
                  <Text style={[styles.followScore, item.accent_color ? { color: item.accent_color } : undefined]}>
                    {item.sosh_score}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.followEmpty}>
                  <Text style={styles.followEmptyText}>Nobody here yet.</Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </Modal>
      )}
    </>
  );
}

function TrophyCard({ trophy }: { trophy: Trophy }) {
  const date = new Date(trophy.awarded_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  return (
    <View style={styles.trophyCard}>
      <View style={styles.trophyCardTop}>
        <Text style={styles.trophyEmoji}>🏆</Text>
        <View style={styles.trophyMeta}>
          <Text style={styles.trophyTitle}>City Rep — {trophy.city ?? 'Global'}</Text>
          <Text style={styles.trophyDate}>{date} · {trophy.vote_count} votes</Text>
        </View>
      </View>
      <Text style={styles.trophyPrompt}>"{trophy.prompt}"</Text>
      {trophy.text_content ? (
        <View style={styles.trophyEntry}>
          <Text style={styles.trophyEntryText}>{trophy.text_content}</Text>
        </View>
      ) : trophy.media_url ? (
        <Image source={{ uri: trophy.media_url }} style={styles.trophyEntryImage} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingTop: 60, gap: 20, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', gap: 16 },

  header: { marginBottom: 8 },
  back: { fontSize: 24, color: '#555' },

  profileHeader: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 4, overflow: 'hidden' },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarLetter: { fontSize: 32, fontWeight: '800', color: '#fff' },
  username: { fontSize: 20, fontWeight: '800', color: '#fff' },
  displayName: { fontSize: 14, color: '#666' },
  location: { fontSize: 13, color: '#444' },
  profileActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  followBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 22, borderWidth: 1, borderColor: '#fff', backgroundColor: 'transparent' },
  msgBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 22, borderWidth: 1, borderColor: '#333', justifyContent: 'center', alignItems: 'center' },
  msgBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  blockedBtn: { paddingHorizontal: 32, paddingVertical: 10, borderRadius: 22, borderWidth: 1, borderColor: '#333', backgroundColor: 'transparent' },
  blockedBtnText: { fontSize: 14, fontWeight: '700', color: '#555' },
  blockedNotice: { fontSize: 13, color: '#444', textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },
  moreBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#333', justifyContent: 'center', alignItems: 'center' },
  moreBtnText: { fontSize: 16, color: '#555', letterSpacing: 2 },
  followBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },
  followBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  followBtnTextActive: { color: '#000' },

  scoreRow: { flexDirection: 'row', backgroundColor: '#0d0d0d', borderRadius: 16, borderWidth: 1, borderColor: '#1a1a1a', overflow: 'hidden' },
  statBox: { flex: 1, padding: 20, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 36, fontWeight: '900', color: '#fff' },
  statLabel: { fontSize: 10, fontWeight: '700', color: '#444', letterSpacing: 2 },
  statDivider: { width: 1, backgroundColor: '#1a1a1a', marginVertical: 16 },

  section: { gap: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#444', letterSpacing: 3 },

  // Posts grid
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -20 },
  gridCell: { width: GRID_CELL, height: GRID_CELL, backgroundColor: '#0d0d0d', borderWidth: 0.5, borderColor: '#000', position: 'relative' },
  gridCellImage: { width: '100%', height: '100%' },
  gridCellText: { flex: 1, padding: 8, justifyContent: 'center' },
  gridCellTextContent: { fontSize: 12, color: '#888', lineHeight: 17 },
  gridVideoIcon: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  gridVideoIconText: { fontSize: 10, color: '#fff' },

  emptyTrophies: { paddingVertical: 32, alignItems: 'center' },
  emptyTrophyText: { fontSize: 14, color: '#333' },

  trophyCard: { backgroundColor: '#0d0d0d', borderRadius: 14, borderWidth: 1, borderColor: '#1a1a1a', padding: 16, gap: 10 },
  trophyCardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  trophyEmoji: { fontSize: 28 },
  trophyMeta: { flex: 1, gap: 2 },
  trophyTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  trophyDate: { fontSize: 12, color: '#555' },
  trophyPrompt: { fontSize: 13, color: '#555', fontStyle: 'italic' },
  trophyEntry: { backgroundColor: '#111', borderRadius: 8, padding: 12 },
  trophyEntryText: { fontSize: 16, color: '#ccc', lineHeight: 22 },
  trophyEntryImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8 },

  // Post detail modal
  postModalContainer: { flex: 1, backgroundColor: '#000' },
  postModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#111' },
  postModalClose: { fontSize: 15, color: '#555' },
  postModalContent: { padding: 20, gap: 14, paddingBottom: 40 },
  postModalTextBox: { backgroundColor: '#0f0f0f', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#1a1a1a' },
  postModalText: { fontSize: 22, color: '#fff', lineHeight: 32, fontWeight: '500' },
  postModalCaption: { fontSize: 15, color: '#888', lineHeight: 22 },
  postModalMeta: { fontSize: 13, color: '#444', fontWeight: '600' },

  bio: { fontSize: 13, color: '#666', lineHeight: 19, textAlign: 'center', paddingHorizontal: 20 },

  followModalContainer: { flex: 1, backgroundColor: '#000' },
  followModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#111' },
  followModalTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  followModalClose: { fontSize: 15, fontWeight: '600', color: '#555' },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#0d0d0d' },
  followAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#222', overflow: 'hidden', flexShrink: 0 },
  followAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  followAvatarLetter: { fontSize: 17, fontWeight: '800', color: '#fff' },
  followInfo: { flex: 1, gap: 2 },
  followName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  followHandle: { fontSize: 12, color: '#555' },
  followScore: { fontSize: 15, fontWeight: '900', color: '#333' },
  followEmpty: { paddingTop: 60, alignItems: 'center' },
  followEmptyText: { color: '#333', fontSize: 14 },

  notFoundText: { fontSize: 16, color: '#444' },
  backLink: { fontSize: 14, color: '#555' },
});
