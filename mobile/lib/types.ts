export interface User {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  city: string | null;
  country_code: string | null;
  avatar_url: string | null;
  accent_color: string | null;
  sosh_score: number;
  trophy_count: number;
  follower_count: number;
  following_count: number;
  current_streak: number;
  longest_streak: number;
  viewer_is_following: boolean;
  viewer_has_blocked: boolean;
  is_admin: boolean;
}

export interface UserSummary {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  accent_color: string | null;
  sosh_score: number;
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
  comment_count: number;
  created_at: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  accent_color: string | null;
  repost_of_id: string | null;
  repost_original_username: string | null;
  repost_original_display_name: string | null;
  viewer_has_liked: boolean;
  viewer_has_bookmarked: boolean;
  viewer_has_reposted: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  accent_color: string | null;
}

export interface Notification {
  id: string;
  type: string;
  body: string;
  read: boolean;
  created_at: string;
  post_id: string | null;
  pulse_id: string | null;
  actor_id: string | null;
  actor_username: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  actor_accent_color: string | null;
}

export interface Conversation {
  conversation_id: string;
  created_at: string;
  other_user_id: string;
  other_username: string | null;
  other_display_name: string | null;
  other_avatar_url: string | null;
  other_accent_color: string | null;
  last_message_body: string | null;
  last_message_sender_id: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  sender_username: string | null;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  sender_accent_color: string | null;
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
