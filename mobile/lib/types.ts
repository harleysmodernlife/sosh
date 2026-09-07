export interface User {
  id: string;
  username: string | null;
  display_name: string | null;
  city: string | null;
  country_code: string | null;
  avatar_url: string | null;
  accent_color: string | null;
  sosh_score: number;
  trophy_count: number;
  follower_count: number;
  following_count: number;
  viewer_is_following: boolean;
  is_admin: boolean;
}

export const ACCENT_PALETTE = [
  { hex: '#E63946', label: 'Red' },
  { hex: '#F4A261', label: 'Orange' },
  { hex: '#2A9D8F', label: 'Teal' },
  { hex: '#457B9D', label: 'Blue' },
  { hex: '#8338EC', label: 'Purple' },
  { hex: '#06D6A0', label: 'Mint' },
] as const;

export interface Pulse {
  id: string;
  prompt: string;
  status: 'active' | 'voting' | 'resolving' | 'resolved';
  submission_ends_at: string | null;
  voting_ends_at: string | null;
  city: string | null;
  country_code: string | null;
}

export interface Entry {
  id: string;
  user_id: string;
  pulse_id: string;
  content_type: 'text' | 'photo' | 'video';
  text_content: string | null;
  media_url: string | null;
  vote_count: number;
  created_at: string;
  username: string;
  display_name: string | null;
  viewer_has_voted: boolean;
}

export interface LeaderboardEntry {
  entry_id: string;
  vote_count: number;
  rank: number;
}

export interface ResolvedPulse {
  id: string;
  prompt: string;
  city: string | null;
  country_code: string | null;
  resolved_at: string;
  winner_id: string | null;
  winner_username: string | null;
  winner_display_name: string | null;
  winner_votes: number | null;
  has_mosaic: boolean;
}

export interface MosaicEntry {
  id: string;
  user_id: string;
  content_type: 'text' | 'photo' | 'video';
  text_content: string | null;
  media_url: string | null;
  vote_count: number;
  username: string | null;
  display_name: string | null;
}

export interface FeedEntry {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  city: string | null;
  content_type: 'text' | 'photo' | 'video';
  text_content: string | null;
  media_url: string | null;
  vote_count: number;
  created_at: string;
  pulse_id: string;
  pulse_prompt: string;
  pulse_city: string | null;
}

export interface MyEntry {
  id: string;
  content_type: 'text' | 'photo' | 'video';
  text_content: string | null;
  media_url: string | null;
  vote_count: number;
  created_at: string;
  pulse_id: string;
  pulse_prompt: string;
  pulse_city: string | null;
  pulse_status: string;
  rank: number;
}

export interface Post {
  id: string;
  user_id: string;
  content_type: 'text' | 'photo' | 'video';
  text_content: string | null;
  media_url: string | null;
  caption: string | null;
  like_count: number;
  created_at: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  accent_color: string | null;
  viewer_has_liked: boolean;
}

export interface Trophy {
  id: string;
  pulse_id: string;
  awarded_at: string;
  prompt: string;
  city: string | null;
  country_code: string | null;
  content_type: 'text' | 'photo' | 'video';
  text_content: string | null;
  media_url: string | null;
  vote_count: number;
}
