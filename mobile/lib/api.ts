import { supabase } from './supabase';
import { API_BASE_URL } from '@/constants/config';
import type { User, Pulse, Entry, LeaderboardEntry, Trophy, ResolvedPulse, MosaicEntry } from './types';

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

    get: (userId: string): Promise<User> => apiFetch(`/users/${userId}`, {}, false),

    update: (data: { username?: string; display_name?: string; city?: string; country_code?: string }): Promise<User> =>
      apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),

    registerPushToken: (token: string): Promise<void> =>
      apiFetch('/users/me/push-token', { method: 'PUT', body: JSON.stringify({ token }) }),
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

  // ─── Reports ──────────────────────────────────────────────────────────────

  reports: {
    flag: (entryId: string): Promise<void> =>
      apiFetch('/reports', { method: 'POST', body: JSON.stringify({ entry_id: entryId }) }),
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
  },

  // ─── Media ────────────────────────────────────────────────────────────────

  media: {
    presign: (contentType: string, pulseId: string) =>
      apiFetch<{ upload_url: string; media_key: string; expires_in: number }>(
        '/media/presign',
        { method: 'POST', body: JSON.stringify({ content_type: contentType, pulse_id: pulseId }) },
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
