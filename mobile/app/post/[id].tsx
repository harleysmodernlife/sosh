import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  Share,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { CommentsModal } from '@/components/CommentsModal';
import type { Post } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!id) return;
    api.posts.get(id)
      .then(p => {
        setPost(p);
        setLiked(p.viewer_has_liked);
        setLikeCount(p.like_count);
        setCommentCount(p.comment_count);
      })
      .catch(() => Alert.alert('Error', 'Could not load post.'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleShare() {
    if (!post) return;
    const deepLink = `sosh://post/${post.id}`;
    const lines: string[] = [`@${post.username} on Sösh`];
    if (post.text_content) lines.push(post.text_content);
    if (post.caption) lines.push(post.caption);
    lines.push(deepLink);
    try {
      await Share.share({ message: lines.join('\n\n') });
    } catch {}
  }

  async function toggleLike() {
    if (!post || inFlight) return;
    setInFlight(true);
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(c => c + (wasLiked ? -1 : 1));
    try {
      if (wasLiked) await api.posts.unlike(post.id);
      else await api.posts.like(post.id);
    } catch {
      setLiked(wasLiked);
      setLikeCount(c => c + (wasLiked ? 1 : -1));
    } finally {
      setInFlight(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Post not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOwn = post.user_id === currentUserId;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backTap}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post</Text>
        {isOwn ? (
          <TouchableOpacity
            style={styles.menuTap}
            onPress={() => Alert.alert('', '', [
              { text: 'Delete', style: 'destructive', onPress: () =>
                Alert.alert('Delete post?', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: async () => {
                    try {
                      await api.posts.delete(post.id);
                      router.back();
                    } catch (e: any) {
                      Alert.alert('Error', e.message);
                    }
                  }},
                ])
              },
              { text: 'Cancel', style: 'cancel' },
            ])}
          >
            <Text style={styles.menuDots}>···</Text>
          </TouchableOpacity>
        ) : <View style={styles.menuTap} />}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={styles.author}
          onPress={() => router.push(`/user/${post.user_id}`)}
          activeOpacity={0.8}
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
          <View style={styles.authorInfo}>
            <Text style={styles.authorName}>{post.display_name ?? `@${post.username}`}</Text>
            <Text style={styles.authorTime}>{formatTimeAgo(post.created_at)}</Text>
          </View>
        </TouchableOpacity>

        {post.content_type !== 'text' && post.media_url ? (
          post.content_type === 'video' ? (
            <Video
              source={{ uri: post.media_url }}
              style={styles.media}
              resizeMode={ResizeMode.COVER}
              shouldPlay
              isLooping
              useNativeControls={false}
            />
          ) : (
            <Image source={{ uri: post.media_url }} style={styles.media} resizeMode="cover" />
          )
        ) : post.text_content ? (
          <View style={styles.textBox}>
            <Text style={styles.textContent}>{post.text_content}</Text>
          </View>
        ) : null}

        {post.caption ? (
          <Text style={styles.caption}>{post.caption}</Text>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={toggleLike} activeOpacity={0.7}>
            <Text style={[styles.actionIcon, liked && styles.actionIconLiked]}>♥</Text>
            <Text style={[styles.actionCount, liked && styles.actionCountLiked]}>{likeCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComments(true)} activeOpacity={0.7}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionCount}>{commentCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.shareBtn]} onPress={handleShare} activeOpacity={0.7}>
            <Text style={styles.shareIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <CommentsModal
        postId={post.id}
        visible={showComments}
        onClose={() => setShowComments(false)}
        onCountChange={delta => setCommentCount(c => c + delta)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', gap: 16 },
  errorText: { color: '#555', fontSize: 16 },
  backBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
  backBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#111',
  },
  backTap: { width: 44, height: 44, justifyContent: 'center' },
  backArrow: { fontSize: 24, color: '#fff' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  menuTap: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-end' },
  menuDots: { fontSize: 18, color: '#444', letterSpacing: 2 },

  body: { paddingBottom: 48, gap: 16 },

  author: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 20 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#222', overflow: 'hidden' },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarLetter: { fontSize: 18, fontWeight: '800', color: '#fff' },
  authorInfo: { flex: 1, gap: 2 },
  authorName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  authorTime: { fontSize: 12, color: '#555' },

  media: { width: SCREEN_WIDTH, aspectRatio: 4 / 3 },
  textBox: { marginHorizontal: 20, backgroundColor: '#0d0d0d', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#1a1a1a' },
  textContent: { fontSize: 22, color: '#fff', lineHeight: 30, fontWeight: '500' },
  caption: { fontSize: 15, color: '#888', paddingHorizontal: 20, lineHeight: 22 },

  actions: { flexDirection: 'row', gap: 24, paddingHorizontal: 20, paddingTop: 4, alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareBtn: { marginLeft: 'auto' },
  shareIcon: { fontSize: 20, color: '#444', fontWeight: '700' },
  actionIcon: { fontSize: 22, color: '#333' },
  actionIconLiked: { color: '#e63946' },
  actionCount: { fontSize: 14, fontWeight: '700', color: '#333' },
  actionCountLiked: { color: '#e63946' },
});
