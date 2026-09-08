import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Dimensions,
  RefreshControl,
  Linking,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { CommentsModal } from '@/components/CommentsModal';
import { FullScreenMediaModal } from '@/components/FullScreenMediaModal';
import * as ImagePicker from 'expo-image-picker';
import { compressImage } from '@/lib/compress';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { ProfileSkeleton } from '@/components/Skeleton';
import type { User, UserSummary, Trophy, MyEntry, Post } from '@/lib/types';
import { ACCENT_PALETTE } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_CELL = Math.floor(SCREEN_WIDTH / 3);

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [entries, setEntries] = useState<MyEntry[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [followList, setFollowList] = useState<{ mode: 'followers' | 'following'; users: UserSummary[] } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);

  useEffect(() => {
    api.notifications.unreadCount().then(r => setUnreadCount(r.count)).catch(() => {});
    api.dm.conversations().then(convs => {
      setDmUnreadCount(convs.reduce((sum, c) => sum + (c.unread_count || 0), 0));
    }).catch(() => {});
  }, []);

  async function pickAndUploadAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setAvatarUploading(true);
    try {
      const compressed = await compressImage(result.assets[0].uri);
      const { upload_url, media_key: publicUrl } = await api.media.presignAvatar();
      await api.media.upload(upload_url, compressed, 'image/jpeg');
      // Add cache-bust so React Native re-fetches the image
      const bustUrl = `${publicUrl}?t=${Date.now()}`;
      const updated = await api.users.update({ avatar_url: bustUrl });
      setUser(updated);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setAvatarUploading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account, entries, votes, and trophies. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: deleteAccount,
        },
      ],
    );
  }

  async function deleteAccount() {
    try {
      await api.users.deleteAccount();
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
    } catch (err: any) {
      Alert.alert('Could not delete account', err.message);
    }
  }

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    try {
      const me = await api.users.me();
      const [myTrophies, myEntries, myPosts, mySaved] = await Promise.all([
        api.trophies.mine(),
        api.users.myEntries(),
        api.posts.forUser(me.id),
        api.posts.bookmarked(),
      ]);
      setUser(me);
      setTrophies(myTrophies);
      setEntries(myEntries);
      setPosts(myPosts);
      setSavedPosts(mySaved);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) {
    return <View style={[styles.container, { flex: 1 }]}><ProfileSkeleton /></View>;
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#fff" />}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <Text style={styles.topBarWordmark}>SÖSH</Text>
          <View style={styles.topBarIcons}>
            <TouchableOpacity style={styles.topBarIcon} onPress={() => router.push('/dm')}>
              <Text style={styles.topBarIconText}>DM</Text>
              {dmUnreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{dmUnreadCount > 9 ? '9+' : dmUnreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.topBarIcon} onPress={() => { setUnreadCount(0); router.push('/notifications'); }}>
              <Text style={styles.topBarIconText}>🔔</Text>
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Profile header */}
        <View style={[styles.profileHeader, user?.accent_color && { borderLeftWidth: 3, borderLeftColor: user.accent_color, paddingLeft: 13 }]}>
          <TouchableOpacity style={[styles.avatar, user?.accent_color && { borderColor: user.accent_color }]} onPress={pickAndUploadAvatar} activeOpacity={0.8}>
            {avatarUploading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarLetter}>
                {(user?.username ?? user?.display_name ?? '?')[0].toUpperCase()}
              </Text>
            )}
            <View style={styles.avatarEditBadge}>
              <Text style={styles.avatarEditBadgeText}>+</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.profileInfo}>
            {user?.display_name
              ? <Text style={styles.displayName}>{user.display_name}</Text>
              : null}
            <Text style={styles.username}>@{user?.username ?? '—'}</Text>
            {user?.city && <Text style={styles.location}>{user.city}</Text>}
            {user?.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
            {user?.website_url ? (
              <TouchableOpacity onPress={() => Linking.openURL(user.website_url!)}>
                <Text style={styles.websiteLink} numberOfLines={1}>{user.website_url.replace(/^https?:\/\//, '')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Profile action buttons */}
        <View style={styles.profileBtns}>
          <TouchableOpacity style={styles.editBtn} onPress={() => setEditVisible(true)}>
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
          {user?.is_admin && (
            <TouchableOpacity style={styles.adminBtn} onPress={() => router.push('/admin')}>
              <Text style={styles.adminBtnText}>Admin</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Profile completeness nudge */}
        {user && !user.avatar_url && !user.bio && (
          <TouchableOpacity style={styles.completenessNudge} onPress={() => setEditVisible(true)} activeOpacity={0.8}>
            <Text style={styles.completenessIcon}>✦</Text>
            <View style={styles.completenessText}>
              <Text style={styles.completenessTitle}>Complete your profile</Text>
              <Text style={styles.completenessBody}>Add a photo and bio so people know who you are.</Text>
            </View>
            <Text style={styles.completenessArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Score */}
        <View style={styles.scoreRow}>
          <TouchableOpacity style={styles.statBox} onPress={async () => {
            if (!user) return;
            const list = await api.users.followers(user.id);
            setFollowList({ mode: 'followers', users: list });
          }}>
            <Text style={styles.statValue}>{user?.follower_count ?? 0}</Text>
            <Text style={styles.statLabel}>FOLLOWERS</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statBox} onPress={async () => {
            if (!user) return;
            const list = await api.users.following(user.id);
            setFollowList({ mode: 'following', users: list });
          }}>
            <Text style={styles.statValue}>{user?.following_count ?? 0}</Text>
            <Text style={styles.statLabel}>FOLLOWING</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{trophies.length}</Text>
            <Text style={styles.statLabel}>TROPHIES</Text>
          </View>
        </View>

        {/* Sösh Score + Streak row */}
        <View style={styles.scoreRowSmall}>
          <Text style={styles.scoreSmallLabel}>SÖSH SCORE</Text>
          <Text style={[styles.scoreSmallValue, user?.accent_color ? { color: user.accent_color } : undefined]}>
            {user?.sosh_score ?? 0}
          </Text>
        </View>

        {(user?.current_streak ?? 0) > 0 && (
          <View style={styles.streakRow}>
            <Text style={styles.streakIcon}>🔥</Text>
            <Text style={styles.streakText}>
              {user?.current_streak} Pulse streak
              {(user?.longest_streak ?? 0) > (user?.current_streak ?? 0)
                ? ` · best: ${user?.longest_streak}`
                : ''}
            </Text>
          </View>
        )}

        {/* Legal */}
        <TouchableOpacity style={styles.legalBtn} onPress={() => router.push('/legal')}>
          <Text style={styles.legalText}>Terms & Privacy</Text>
        </TouchableOpacity>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        {/* Delete account */}
        <TouchableOpacity style={styles.deleteBtn} onPress={confirmDeleteAccount}>
          <Text style={styles.deleteText}>Delete Account</Text>
        </TouchableOpacity>

        {/* Posts Grid */}
        {posts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>POSTS</Text>
              <TouchableOpacity onPress={() => router.push('/compose')}>
                <Text style={styles.sectionAction}>+ New</Text>
              </TouchableOpacity>
            </View>
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
                      <Text style={styles.gridCellTextContent} numberOfLines={4}>
                        {p.text_content}
                      </Text>
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

        {posts.length === 0 && (
          <TouchableOpacity style={styles.newPostCta} onPress={() => router.push('/compose')}>
            <Text style={styles.newPostCtaText}>+ Share your first post</Text>
          </TouchableOpacity>
        )}

        {/* Saved Posts */}
        {savedPosts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SAVED</Text>
            <View style={styles.postsGrid}>
              {savedPosts.map(p => (
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
                      <Text style={styles.gridCellTextContent} numberOfLines={4}>
                        {p.text_content}
                      </Text>
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

        {/* My Entries */}
        {entries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MY ENTRIES</Text>
            {entries.map(e => <MyEntryCard key={e.id} entry={e} />)}
          </View>
        )}

        {/* Trophy Case */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TROPHY CASE</Text>

          {trophies.length === 0 ? (
            <View style={styles.emptyTrophies}>
              <Text style={styles.emptyTrophyIcon}>🏆</Text>
              <Text style={styles.emptyTrophyText}>No trophies yet</Text>
              <Text style={styles.emptyTrophyHint}>
                Win a Pulse to earn your first City Rep title.
              </Text>
            </View>
          ) : (
            trophies.map(t => <TrophyCard key={t.id} trophy={t} />)
          )}
        </View>
      </ScrollView>

      <EditProfileModal
        visible={editVisible}
        user={user}
        onClose={() => setEditVisible(false)}
        onSave={updated => { setUser(updated); setEditVisible(false); }}
      />

      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onDelete={() => {
            setPosts(prev => prev.filter(p => p.id !== selectedPost.id));
            setSelectedPost(null);
          }}
          onUpdate={updated => {
            const merged = { ...selectedPost, ...updated };
            setPosts(prev => prev.map(p => p.id === selectedPost.id ? merged : p));
            setSelectedPost(merged);
          }}
        />
      )}
      {followList && (
        <FollowListModal
          mode={followList.mode}
          users={followList.users}
          onClose={() => setFollowList(null)}
        />
      )}
    </>
  );
}

function FollowListModal({
  mode,
  users,
  onClose,
}: {
  mode: 'followers' | 'following';
  users: UserSummary[];
  onClose: () => void;
}) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.followModalContainer}>
        <View style={styles.followModalHeader}>
          <Text style={styles.followModalTitle}>{mode === 'followers' ? 'Followers' : 'Following'}</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.followModalClose}>Done</Text></TouchableOpacity>
        </View>
        <FlatList
          data={users}
          keyExtractor={u => u.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.followRow}
              onPress={() => { onClose(); router.push(`/user/${item.id}`); }}
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
  );
}

function MyEntryCard({ entry }: { entry: MyEntry }) {
  const isActive = entry.pulse_status === 'active' || entry.pulse_status === 'voting';
  const rankLabel = entry.pulse_status === 'resolved'
    ? `#${entry.rank}`
    : isActive ? 'Live' : '—';
  const rankIsWin = entry.rank === 1 && entry.pulse_status === 'resolved';

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryCardTop}>
        <View style={[styles.entryRankBadge, rankIsWin && styles.entryRankBadgeWin]}>
          <Text style={[styles.entryRank, rankIsWin && styles.entryRankWin]}>{rankLabel}</Text>
        </View>
        <View style={styles.entryMeta}>
          <Text style={styles.entryPrompt} numberOfLines={2}>"{entry.pulse_prompt}"</Text>
          {entry.pulse_city && <Text style={styles.entryCity}>{entry.pulse_city}</Text>}
        </View>
        <View style={styles.entryVoteBox}>
          <Text style={styles.entryVoteCount}>{entry.vote_count}</Text>
          <Text style={styles.entryVoteLabel}>votes</Text>
        </View>
      </View>

      {entry.text_content ? (
        <View style={styles.entryTextBox}>
          <Text style={styles.entryText} numberOfLines={3}>{entry.text_content}</Text>
        </View>
      ) : entry.media_url ? (
        <Image
          source={{ uri: entry.media_url }}
          style={styles.entryImage}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

function TrophyCard({ trophy }: { trophy: Trophy }) {
  const date = new Date(trophy.awarded_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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

function PostDetailModal({
  post,
  onClose,
  onDelete,
  onUpdate,
}: {
  post: Post;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: (updated: Partial<Post>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.text_content ?? '');
  const [editCaption, setEditCaption] = useState(post.caption ?? '');
  const [saving, setSaving] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [mediaFull, setMediaFull] = useState(false);

  async function saveEdit() {
    setSaving(true);
    try {
      await api.posts.update(post.id, {
        text_content: post.content_type === 'text' ? editText.trim() || undefined : undefined,
        caption: editCaption.trim() || null,
      });
      onUpdate({
        text_content: post.content_type === 'text' ? editText.trim() : post.text_content,
        caption: editCaption.trim() || null,
      });
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Could not save', err.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.posts.delete(post.id);
            onDelete();
          } catch (err: any) {
            Alert.alert('Could not delete', err.message);
          }
        },
      },
    ]);
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.postModalContainer}>
        <View style={styles.postModalHeader}>
          <TouchableOpacity onPress={editing ? () => setEditing(false) : onClose}>
            <Text style={styles.postModalClose}>{editing ? 'Cancel' : 'Close'}</Text>
          </TouchableOpacity>
          {editing ? (
            <TouchableOpacity onPress={saveEdit} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.postModalSave}>Save</Text>}
            </TouchableOpacity>
          ) : (
            <View style={styles.postModalActions}>
              <TouchableOpacity onPress={() => setEditing(true)}>
                <Text style={styles.postModalEdit}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete}>
                <Text style={styles.postModalDelete}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.postModalContent} keyboardShouldPersistTaps="handled">
          {post.content_type !== 'text' && post.media_url ? (
            <TouchableOpacity activeOpacity={0.9} onPress={() => setMediaFull(true)}>
              <Image
                source={{ uri: post.media_url }}
                style={{ width: SCREEN_WIDTH - 40, aspectRatio: 4 / 3, borderRadius: 12 }}
                resizeMode="cover"
              />
              <View style={styles.expandHint}>
                <Text style={styles.expandHintText}>⤢ Tap to expand</Text>
              </View>
            </TouchableOpacity>
          ) : editing ? (
            <TextInput
              style={styles.postModalEditInput}
              value={editText}
              onChangeText={t => setEditText(t.slice(0, 500))}
              multiline
              maxLength={500}
              placeholder="Post text..."
              placeholderTextColor="#444"
            />
          ) : post.text_content ? (
            <View style={styles.postModalTextBox}>
              <Text style={styles.postModalText}>{post.text_content}</Text>
            </View>
          ) : null}

          {editing ? (
            <View style={styles.postModalCaptionEdit}>
              <Text style={styles.captionEditLabel}>CAPTION</Text>
              <TextInput
                style={styles.postModalEditInput}
                value={editCaption}
                onChangeText={t => setEditCaption(t.slice(0, 300))}
                multiline
                maxLength={300}
                placeholder="Add a caption..."
                placeholderTextColor="#444"
              />
            </View>
          ) : post.caption ? (
            <Text style={styles.postModalCaption}>{post.caption}</Text>
          ) : null}

          {!editing && (
            <View style={styles.postModalMetaRow}>
              <Text style={styles.postModalMeta}>♥ {post.like_count} likes</Text>
              <TouchableOpacity onPress={() => setShowComments(true)}>
                <Text style={styles.postModalMeta}>💬 {commentCount} comments</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>

      <CommentsModal
        postId={post.id}
        visible={showComments}
        onClose={() => setShowComments(false)}
        onCountChange={delta => setCommentCount(c => c + delta)}
      />

      {post.media_url && post.content_type !== 'text' && (
        <FullScreenMediaModal
          visible={mediaFull}
          uri={post.media_url}
          type={post.content_type}
          onClose={() => setMediaFull(false)}
        />
      )}
    </Modal>
  );
}

function EditProfileModal({
  visible,
  user,
  onClose,
  onSave,
}: {
  visible: boolean;
  user: User | null;
  onClose: () => void;
  onSave: (u: User) => void;
}) {
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(user?.website_url ?? '');
  const [accentColor, setAccentColor] = useState<string | null>(user?.accent_color ?? null);
  const [saving, setSaving] = useState(false);

  const usernameValid = /^[a-zA-Z0-9_]{3,30}$/.test(username);

  async function save() {
    if (!usernameValid) {
      Alert.alert('Invalid username', 'Use 3–30 characters: letters, numbers, underscores only.');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.users.update({
        username: username.trim(),
        display_name: displayName || undefined,
        bio: bio.trim() || null,
        city: city || undefined,
        accent_color: accentColor,
        website_url: websiteUrl.trim() || null,
      });
      onSave(updated);
    } catch (err: any) {
      Alert.alert('Could not save', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Edit Profile</Text>
          <TouchableOpacity onPress={save} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.modalSave}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.modalFields}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>USERNAME</Text>
            <TextInput
              style={[styles.fieldInput, username.length > 0 && !usernameValid && { borderColor: '#661111' }]}
              value={username}
              onChangeText={t => setUsername(t.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30))}
              placeholder="your_username"
              placeholderTextColor="#444"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
            />
            <Text style={styles.fieldHint}>Letters, numbers, underscores only. Changing this updates your @ everywhere.</Text>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
            <TextInput
              style={styles.fieldInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="How you want to be known"
              placeholderTextColor="#444"
              maxLength={50}
            />
            <Text style={styles.fieldHint}>Shown on your entries alongside @{username || user?.username}</Text>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>BIO</Text>
            <TextInput
              style={[styles.fieldInput, { minHeight: 70, textAlignVertical: 'top' }]}
              value={bio}
              onChangeText={t => setBio(t.slice(0, 200))}
              placeholder="Say something about yourself..."
              placeholderTextColor="#444"
              multiline
              maxLength={200}
            />
            <Text style={styles.fieldHint}>{bio.length}/200</Text>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>CITY</Text>
            <TextInput
              style={styles.fieldInput}
              value={city}
              onChangeText={setCity}
              placeholder="Nashville"
              placeholderTextColor="#444"
              autoCapitalize="words"
              maxLength={100}
            />
            <Text style={styles.fieldHint}>Your city leaderboard — contact support to change</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>WEBSITE</Text>
            <TextInput
              style={styles.fieldInput}
              value={websiteUrl}
              onChangeText={setWebsiteUrl}
              placeholder="https://yoursite.com"
              placeholderTextColor="#444"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              maxLength={500}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>ACCENT COLOR</Text>
            <View style={styles.colorPicker}>
              {ACCENT_PALETTE.map(({ hex, label }) => (
                <TouchableOpacity
                  key={hex}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: hex },
                    accentColor === hex && styles.colorSwatchActive,
                  ]}
                  onPress={() => setAccentColor(accentColor === hex ? null : hex)}
                  accessibilityLabel={label}
                />
              ))}
            </View>
            <Text style={styles.fieldHint}>Tints your profile accent — tap to select, tap again to clear</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingTop: 56, gap: 16, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  topBarWordmark: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: 5 },
  topBarIcons: { flexDirection: 'row', gap: 4 },
  topBarIcon: { height: 36, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', position: 'relative', borderRadius: 18, borderWidth: 1, borderColor: '#222' },
  topBarIconText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333', overflow: 'hidden', flexShrink: 0 },
  avatarImage: { width: 60, height: 60, borderRadius: 30 },
  avatarLetter: { fontSize: 24, fontWeight: '800', color: '#fff' },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  avatarEditBadgeText: { fontSize: 13, fontWeight: '800', color: '#000', lineHeight: 16 },
  profileInfo: { flex: 1, gap: 1 },
  displayName: { fontSize: 17, fontWeight: '700', color: '#fff' },
  username: { fontSize: 13, color: '#666' },
  location: { fontSize: 12, color: '#444', marginTop: 1 },

  profileBtns: { flexDirection: 'row', gap: 8 },
  notifBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: '#e63946', borderRadius: 7, minWidth: 14, height: 14, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  notifBadgeText: { fontSize: 8, fontWeight: '900', color: '#fff' },
  adminBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: '#443', backgroundColor: '#0f0f00' },
  adminBtnText: { color: '#aa9900', fontSize: 13, fontWeight: '600' },
  editBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: '#333', backgroundColor: '#111' },
  editBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  websiteLink: { fontSize: 13, color: '#5ba3e0', marginTop: 2 },

  completenessNudge: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0a0f1a', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#1a2a3a',
  },
  completenessIcon: { fontSize: 20, color: '#5ba3e0' },
  completenessText: { flex: 1, gap: 2 },
  completenessTitle: { fontSize: 14, fontWeight: '700', color: '#ccc' },
  completenessBody: { fontSize: 12, color: '#555', lineHeight: 17 },
  completenessArrow: { fontSize: 22, color: '#333' },

  scoreRow: { flexDirection: 'row', backgroundColor: '#0d0d0d', borderRadius: 16, borderWidth: 1, borderColor: '#1a1a1a', overflow: 'hidden' },
  statBox: { flex: 1, paddingVertical: 18, paddingHorizontal: 8, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 28, fontWeight: '900', color: '#fff' },
  statLabel: { fontSize: 9, fontWeight: '700', color: '#444', letterSpacing: 1.5 },
  statDivider: { width: 1, backgroundColor: '#1a1a1a', marginVertical: 14 },
  scoreRowSmall: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  scoreSmallLabel: { fontSize: 10, fontWeight: '700', color: '#333', letterSpacing: 2 },
  scoreSmallValue: { fontSize: 16, fontWeight: '800', color: '#555' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakIcon: { fontSize: 16 },
  streakText: { fontSize: 13, fontWeight: '700', color: '#e63946' },

  section: { gap: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#444', letterSpacing: 3 },

  emptyTrophies: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTrophyIcon: { fontSize: 40 },
  emptyTrophyText: { fontSize: 16, color: '#444' },
  emptyTrophyHint: { fontSize: 13, color: '#333', textAlign: 'center' },

  // My Entry cards
  entryCard: { backgroundColor: '#0d0d0d', borderRadius: 14, borderWidth: 1, borderColor: '#1a1a1a', padding: 16, gap: 12 },
  entryCardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  entryRankBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#111', borderWidth: 1, borderColor: '#222', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  entryRankBadgeWin: { backgroundColor: '#1a1500', borderColor: '#443300' },
  entryRank: { fontSize: 13, fontWeight: '800', color: '#555' },
  entryRankWin: { color: '#cc9900' },
  entryMeta: { flex: 1, gap: 3 },
  entryPrompt: { fontSize: 13, color: '#555', fontStyle: 'italic', lineHeight: 18 },
  entryCity: { fontSize: 11, color: '#333' },
  entryVoteBox: { alignItems: 'center', gap: 1 },
  entryVoteCount: { fontSize: 20, fontWeight: '900', color: '#fff' },
  entryVoteLabel: { fontSize: 9, fontWeight: '700', color: '#444', letterSpacing: 1 },
  entryTextBox: { backgroundColor: '#111', borderRadius: 8, padding: 12 },
  entryText: { fontSize: 16, color: '#ccc', lineHeight: 22 },
  entryImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8 },

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

  legalBtn: { paddingVertical: 10, alignItems: 'center' },
  legalText: { color: '#333', fontSize: 12, fontWeight: '500', letterSpacing: 0.5 },
  deleteBtn: { paddingVertical: 10, alignItems: 'center' },
  deleteText: { color: '#3a1111', fontSize: 12, fontWeight: '500', letterSpacing: 0.5 },
  signOutBtn: { paddingVertical: 14, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#1a1a1a' },
  signOutText: { color: '#444', fontSize: 14, fontWeight: '600' },

  modalContainer: { flex: 1, backgroundColor: '#000' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#111' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  modalCancel: { fontSize: 15, color: '#555' },
  modalSave: { fontSize: 15, fontWeight: '700', color: '#fff' },
  modalFields: { padding: 20, gap: 20 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#444', letterSpacing: 3 },
  fieldInput: { backgroundColor: '#111', borderWidth: 1, borderColor: '#222', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, color: '#fff', fontSize: 16 },
  fieldHint: { fontSize: 11, color: '#333', marginTop: 2 },
  colorPicker: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, opacity: 0.7 },
  colorSwatchActive: { opacity: 1, borderWidth: 3, borderColor: '#fff' },

  // Posts grid
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionAction: { fontSize: 12, fontWeight: '700', color: '#555' },
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -20 },
  gridCell: { width: GRID_CELL, height: GRID_CELL, backgroundColor: '#0d0d0d', borderWidth: 0.5, borderColor: '#000', position: 'relative' },
  gridCellImage: { width: '100%', height: '100%' },
  gridCellText: { flex: 1, padding: 8, justifyContent: 'center' },
  gridCellTextContent: { fontSize: 12, color: '#888', lineHeight: 17 },
  gridVideoIcon: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  gridVideoIconText: { fontSize: 10, color: '#fff' },
  newPostCta: { paddingVertical: 14, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#1a1a1a', borderStyle: 'dashed' },
  newPostCtaText: { fontSize: 13, color: '#333', fontWeight: '600' },
  expandHint: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  expandHintText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  // Post detail modal
  postModalContainer: { flex: 1, backgroundColor: '#000' },
  postModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#111' },
  postModalClose: { fontSize: 15, color: '#555' },
  postModalActions: { flexDirection: 'row', gap: 20 },
  postModalEdit: { fontSize: 15, color: '#fff', fontWeight: '600' },
  postModalSave: { fontSize: 15, color: '#fff', fontWeight: '700' },
  postModalDelete: { fontSize: 15, color: '#661111', fontWeight: '600' },
  postModalContent: { padding: 20, gap: 14, paddingBottom: 40 },
  postModalTextBox: { backgroundColor: '#0f0f0f', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#1a1a1a' },
  postModalText: { fontSize: 22, color: '#fff', lineHeight: 32, fontWeight: '500' },
  postModalEditInput: { backgroundColor: '#111', borderWidth: 1, borderColor: '#222', borderRadius: 10, padding: 16, color: '#fff', fontSize: 17, lineHeight: 25, minHeight: 80, textAlignVertical: 'top' },
  postModalCaptionEdit: { gap: 8 },
  captionEditLabel: { fontSize: 10, fontWeight: '700', color: '#444', letterSpacing: 3 },
  postModalCaption: { fontSize: 15, color: '#888', lineHeight: 22 },
  postModalMeta: { fontSize: 13, color: '#444', fontWeight: '600' },
  postModalMetaRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },

  bio: { fontSize: 13, color: '#666', lineHeight: 19, marginTop: 4 },

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
});
