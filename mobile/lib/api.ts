import { supabase } from './supabase';
import { API_BASE_URL } from '@/constants/config';
import type { User, UserSummary, Pulse, Entry, LeaderboardEntry, Trophy, ResolvedPulse, MosaicEntry, MyEntry, Post, Comment, Notification, Conversation, DirectMessage, EntryReactionMap } from './types';

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return token;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  requireAuth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (requireAuth) {
    headers['Authorization'] = `Bearer ${await getToken()}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {}
    throw new Error(detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Users ───────────────────────────────────────────────────────────────────

export const api = {
  users: {
    me: (): Promise<User> => apiFetch('/users/me'),

    get: (userId: string): Promise<User> => apiFetch(`/users/${userId}`),

    search: (q: string): Promise<User[]> => apiFetch(`/users/search?q=${encodeURIComponent(q)}`, {}, false),

    suggested: (): Promise<User[]> => apiFetch('/users/suggested'),

    followers: (userId: string): Promise<UserSummary[]> =>
      apiFetch(`/users/${userId}/followers`, {}, false),

    following: (userId: string): Promise<UserSummary[]> =>
      apiFetch(`/users/${userId}/following`, {}, false),

    follow: (userId: string): Promise<void> =>
      apiFetch(`/users/${userId}/follow`, { method: 'POST' }),

    unfollow: (userId: string): Promise<void> =>
      apiFetch(`/users/${userId}/follow`, { method: 'DELETE' }),

    block: (userId: string): Promise<void> =>
      apiFetch(`/users/${userId}/block`, { method: 'POST' }),

    unblock: (userId: string): Promise<void> =>
      apiFetch(`/users/${userId}/block`, { method: 'DELETE' }),

    update: (data: { username?: string; display_name?: string; bio?: string | null; city?: string; country_code?: string; avatar_url?: string; accent_color?: string | null }): Promise<User> =>
      apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),

    myEntries: (): Promise<MyEntry[]> => apiFetch('/users/me/entries'),

    registerPushToken: (token: string): Promise<void> =>
      apiFetch('/users/me/push-token', { method: 'PUT', body: JSON.stringify({ token }) }),

    deleteAccount: (): Promise<void> =>
      apiFetch('/users/me', { method: 'DELETE' }),
  },

  // ─── Pulses ────────────────────────────────────────────────────────────────

  pulses: {
    active: (): Promise<Pulse | null> => apiFetch('/pulses/active', {}, false),

    get: (pulseId: string): Promise<Pulse> => apiFetch(`/pulses/${pulseId}`, {}, false),

    leaderboard: (pulseId: string): Promise<LeaderboardEntry[]> =>
      apiFetch(`/pulses/${pulseId}/leaderboard`, {}, false),

    entries: (pulseId: string): Promise<Entry[]> =>
      apiFetch(`/pulses/${pulseId}/entries`),

    resolved: (): Promise<ResolvedPulse[]> =>
      apiFetch('/pulses/resolved', {}, false),

    mosaic: (pulseId: string): Promise<MosaicEntry[]> =>
      apiFetch(`/pulses/${pulseId}/mosaic`, {}, false),
  },

  // ─── Entries ───────────────────────────────────────────────────────────────

  entries: {
    submit: (data: {
      pulse_id: string;
      content_type: 'text' | 'photo' | 'video';
      text_content?: string;
      media_key?: string;
    }): Promise<Entry> =>
      apiFetch('/entries', { method: 'POST', body: JSON.stringify(data) }),

    reactions: (entryId: string): Promise<EntryReactionMap> =>
      apiFetch(`/entries/${entryId}/reactions`),

    react: (entryId: string, emoji: string): Promise<void> =>
      apiFetch(`/entries/${entryId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  },

  // ─── Votes ────────────────────────────────────────────────────────────────

  votes: {
    cast: (entryId: string): Promise<void> =>
      apiFetch('/votes', { method: 'POST', body: JSON.stringify({ entry_id: entryId }) }),

    remove: (entryId: string): Promise<void> =>
      apiFetch(`/votes/${entryId}`, { method: 'DELETE' }),
  },

  // ─── Trophies ─────────────────────────────────────────────────────────────

  trophies: {
    mine: (): Promise<Trophy[]> => apiFetch('/trophies/me'),

    forUser: (userId: string): Promise<Trophy[]> =>
      apiFetch(`/trophies/${userId}`, {}, false),
  },

  // ─── Feed ─────────────────────────────────────────────────────────────────

  feed: {
    get: (offset = 0, limit = 10): Promise<import('./types').FeedEntry[]> =>
      apiFetch(`/feed?offset=${offset}&limit=${limit}`, {}, false),
  },

  // ─── Invites ──────────────────────────────────────────────────────────────

  invites: {
    validate: (code: string): Promise<{ code: string; valid: boolean }> =>
      apiFetch(`/invites/${code}`, {}, false),

    redeem: (code: string, userId: string): Promise<void> =>
      apiFetch(`/invites/${code}/redeem`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),

    create: (label?: string, expiresDays?: number): Promise<{ code: string; label: string | null; expires_at: string | null }> =>
      apiFetch('/admin/invites', { method: 'POST', body: JSON.stringify({ label, expires_days: expiresDays }) }),

    list: (): Promise<{ id: string; code: string; label: string | null; created_at: string; expires_at: string | null; used_at: string | null; used_by_username: string | null }[]> =>
      apiFetch('/admin/invites'),
  },

  // ─── Posts ────────────────────────────────────────────────────────────────

  posts: {
    get: (postId: string): Promise<Post> =>
      apiFetch(`/posts/${postId}`),

    create: (data: {
      content_type: 'text' | 'photo' | 'video';
      text_content?: string;
      media_url?: string;
      caption?: string;
    }): Promise<Post> =>
      apiFetch('/posts', { method: 'POST', body: JSON.stringify(data) }),

    search: (q: string): Promise<Post[]> =>
      apiFetch(`/posts/search?q=${encodeURIComponent(q)}`),

    feed: (offset = 0, limit = 20, mode: 'foryou' | 'following' = 'foryou'): Promise<Post[]> =>
      apiFetch(`/posts/feed?offset=${offset}&limit=${limit}&mode=${mode}`),

    forUser: (userId: string, offset = 0): Promise<Post[]> =>
      apiFetch(`/posts/user/${userId}?offset=${offset}&limit=30`),

    update: (postId: string, data: { text_content?: string; caption?: string | null }): Promise<void> =>
      apiFetch(`/posts/${postId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    delete: (postId: string): Promise<void> =>
      apiFetch(`/posts/${postId}`, { method: 'DELETE' }),

    like: (postId: string): Promise<void> =>
      apiFetch(`/posts/${postId}/like`, { method: 'POST' }),

    unlike: (postId: string): Promise<void> =>
      apiFetch(`/posts/${postId}/like`, { method: 'DELETE' }),

    repost: (postId: string): Promise<{ id: string }> =>
      apiFetch(`/posts/${postId}/repost`, { method: 'POST' }),

    unrepost: (postId: string): Promise<void> =>
      apiFetch(`/posts/${postId}/repost`, { method: 'DELETE' }),

    bookmark: (postId: string): Promise<void> =>
      apiFetch(`/posts/${postId}/bookmark`, { method: 'POST' }),

    unbookmark: (postId: string): Promise<void> =>
      apiFetch(`/posts/${postId}/bookmark`, { method: 'DELETE' }),

    bookmarked: (offset = 0, limit = 20): Promise<Post[]> =>
      apiFetch(`/posts/bookmarked?offset=${offset}&limit=${limit}`),
  },

  // ─── Comments ─────────────────────────────────────────────────────────────

  comments: {
    list: (postId: string): Promise<Comment[]> =>
      apiFetch(`/posts/${postId}/comments`),

    create: (postId: string, body: string, parentId?: string): Promise<Comment> =>
      apiFetch(`/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body, parent_id: parentId }) }),

    delete: (postId: string, commentId: string): Promise<void> =>
      apiFetch(`/posts/${postId}/comments/${commentId}`, { method: 'DELETE' }),
  },

  // ─── Notifications ────────────────────────────────────────────────────────

  notifications: {
    list: (): Promise<Notification[]> => apiFetch('/notifications'),
    unreadCount: (): Promise<{ count: number }> => apiFetch('/notifications/unread-count'),
    markAllRead: (): Promise<void> => apiFetch('/notifications/read', { method: 'POST' }),
  },

  // ─── DMs ──────────────────────────────────────────────────────────────────

  dm: {
    conversations: (): Promise<Conversation[]> =>
      apiFetch('/dm/conversations'),

    startOrGet: (userId: string): Promise<{ conversation_id: string }> =>
      apiFetch('/dm/conversations', { method: 'POST', body: JSON.stringify({ user_id: userId }) }),

    messages: (conversationId: string, offset = 0, limit = 50): Promise<DirectMessage[]> =>
      apiFetch(`/dm/conversations/${conversationId}/messages?offset=${offset}&limit=${limit}`),

    send: (conversationId: string, body: string | null, mediaUrl?: string, mediaType?: 'image' | 'video'): Promise<DirectMessage> =>
      apiFetch(`/dm/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ body, media_url: mediaUrl, media_type: mediaType }) }),

    markRead: (conversationId: string): Promise<void> =>
      apiFetch(`/dm/conversations/${conversationId}/read`, { method: 'POST' }),
  },

  // ─── Reports ──────────────────────────────────────────────────────────────

  reports: {
    flagEntry: (entryId: string): Promise<void> =>
      apiFetch('/reports', { method: 'POST', body: JSON.stringify({ entry_id: entryId }) }),

    flagPost: (postId: string): Promise<void> =>
      apiFetch('/reports/post', { method: 'POST', body: JSON.stringify({ post_id: postId }) }),

    flagUser: (userId: string): Promise<void> =>
      apiFetch('/reports/user', { method: 'POST', body: JSON.stringify({ user_id: userId }) }),

    adminPosts: (): Promise<any[]> => apiFetch('/reports/admin/posts'),
    adminUsers: (): Promise<any[]> => apiFetch('/reports/admin/users'),
  },

  // ─── Admin ────────────────────────────────────────────────────────────────

  admin: {
    firePulse: (data: {
      prompt: string;
      submission_window_minutes?: number;
      voting_window_hours?: number;
      city?: string;
      country_code?: string;
    }): Promise<{ id: string; prompt: string; status: string; submission_ends_at: string; voting_ends_at: string }> =>
      apiFetch('/admin/pulses', { method: 'POST', body: JSON.stringify(data) }),

    resolvePulse: (pulseId: string): Promise<void> =>
      apiFetch(`/admin/pulses/${pulseId}/resolve`, { method: 'POST' }),

    getSchedule: (): Promise<{ enabled: boolean; cron: string | null; next_run: string | null }> =>
      apiFetch('/admin/schedule'),

    setSchedule: (cron: string): Promise<{ enabled: boolean; cron: string | null; next_run: string | null }> =>
      apiFetch('/admin/schedule', { method: 'POST', body: JSON.stringify({ cron }) }),

    deleteSchedule: (): Promise<void> =>
      apiFetch('/admin/schedule', { method: 'DELETE' }),

    deletePost: (postId: string): Promise<void> =>
      apiFetch(`/admin/posts/${postId}`, { method: 'DELETE' }),

    banUser: (userId: string): Promise<void> =>
      apiFetch(`/admin/users/${userId}`, { method: 'DELETE' }),
  },

  // ─── Media ────────────────────────────────────────────────────────────────

  media: {
    presign: (contentType: string, pulseId?: string) =>
      apiFetch<{ upload_url: string; media_key: string; expires_in: number }>(
        '/media/presign',
        { method: 'POST', body: JSON.stringify({ content_type: contentType, pulse_id: pulseId }) },
      ),

    presignAvatar: () =>
      apiFetch<{ upload_url: string; media_key: string; expires_in: number }>(
        '/media/presign-avatar',
        { method: 'POST' },
      ),

    upload: async (uploadUrl: string, uri: string, contentType: string): Promise<void> => {
      const response = await fetch(uri);
      const blob = await response.blob();
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
      });
      if (!res.ok) throw new Error('Upload failed');
    },
  },
};
