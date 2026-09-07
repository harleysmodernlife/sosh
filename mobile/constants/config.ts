// API base URL — update to your local machine's IP when testing on a physical device
// e.g. "http://192.168.1.42:8000"
export const API_BASE_URL = __DEV__
  ? 'http://100.82.174.33:8000'
  : 'https://sosh-production.up.railway.app';

export const SUPABASE_URL = 'https://gxtbcxkdodmfikkhncmw.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4dGJjeGtkb2RtZmlra2huY213Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MzY1NjUsImV4cCI6MjEwNDMxMjU2NX0.t6M09Zebz5oggF5qo6yPsBnnptJ2L01PLFhOmrTAgcI';

// How often to poll the leaderboard during an active Pulse (ms)
export const LEADERBOARD_POLL_MS = 5000;
