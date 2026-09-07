import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { LEADERBOARD_POLL_MS } from '@/constants/config';
import type { Pulse, Entry, LeaderboardEntry } from '@/lib/types';
import { useCountdown } from '@/components/useCountdown';

export default function LeaderboardScreen() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [votingInFlight, setVotingInFlight] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const p = await api.pulses.active();
      setPulse(p);

      if (p && (p.status === 'active' || p.status === 'voting')) {
        const [lb, ents] = await Promise.all([
          api.pulses.leaderboard(p.id),
          api.pulses.entries(p.id),
        ]);
        setLeaderboard(lb);
        setEntries(ents);
      }
    } catch {}
    finally { setLoading(false); }
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();

    pollRef.current = setInterval(async () => {
      try {
        const p = await api.pulses.active();
        setPulse(p);
        if (p && (p.status === 'active' || p.status === 'voting')) {
          const lb = await api.pulses.leaderboard(p.id);
          setLeaderboard(lb);
        }
      } catch {}
    }, LEADERBOARD_POLL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []));

  const countdown = useCountdown(
    pulse?.status === 'active' ? pulse.submission_ends_at : pulse?.voting_ends_at,
  );

  // Merge leaderboard ranks with entry details
  const ranked = leaderboard
    .map(lb => {
      const entry = entries.find(e => e.id === lb.entry_id);
      return entry ? { ...entry, rank: lb.rank, vote_count: lb.vote_count } : null;
    })
    .filter(Boolean) as (Entry & { rank: number })[];

  async function vote(entry: Entry) {
    if (entry.viewer_has_voted) {
      // Unvote
      try {
        setVotingInFlight(s => new Set(s).add(entry.id));
        await api.votes.remove(entry.id);
        setEntries(prev => prev.map(e => e.id === entry.id
          ? { ...e, viewer_has_voted: false, vote_count: e.vote_count - 1 }
          : e));
        setLeaderboard(prev => prev.map(lb => lb.entry_id === entry.id
          ? { ...lb, vote_count: lb.vote_count - 1 }
          : lb));
      } catch (err: any) {
        Alert.alert('Could not remove vote', err.message);
      } finally {
        setVotingInFlight(s => { const n = new Set(s); n.delete(entry.id); return n; });
      }
    } else {
      // Vote
      try {
        setVotingInFlight(s => new Set(s).add(entry.id));
        await api.votes.cast(entry.id);
        setEntries(prev => prev.map(e => e.id === entry.id
          ? { ...e, viewer_has_voted: true, vote_count: e.vote_count + 1 }
          : e));
        setLeaderboard(prev => prev.map(lb => lb.entry_id === entry.id
          ? { ...lb, vote_count: lb.vote_count + 1 }
          : lb));
      } catch (err: any) {
        Alert.alert('Could not vote', err.message);
      } finally {
        setVotingInFlight(s => { const n = new Set(s); n.delete(entry.id); return n; });
      }
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>;
  }

  if (!pulse || pulse.status === 'resolved' || pulse.status === 'resolving') {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>▲</Text>
        <Text style={styles.emptyTitle}>No active Pulse</Text>
        <Text style={styles.emptyText}>The leaderboard will appear here when a Pulse is live.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            {pulse.status === 'active' ? 'Live Entries' : 'Leaderboard'}
          </Text>
          {pulse.city && <Text style={styles.headerCity}>{pulse.city}</Text>}
        </View>
        {countdown && (
          <View>
            <Text style={styles.countdownLabel}>
              {pulse.status === 'active' ? 'SUBMISSION' : 'VOTING'}
            </Text>
            <Text style={styles.countdown}>{countdown}</Text>
          </View>
        )}
      </View>

      <Text style={styles.prompt} numberOfLines={2}>"{pulse.prompt}"</Text>

      {ranked.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No entries yet. Be the first!</Text>
        </View>
      ) : (
        <FlatList
          data={ranked}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <EntryCard
              entry={item}
              onVote={() => vote(item)}
              voteInFlight={votingInFlight.has(item.id)}
              canVote={pulse.status === 'voting' || pulse.status === 'active'}
            />
          )}
        />
      )}
    </View>
  );
}

function EntryCard({
  entry,
  onVote,
  voteInFlight,
  canVote,
}: {
  entry: Entry & { rank: number };
  onVote: () => void;
  voteInFlight: boolean;
  canVote: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.rank}>
        <Text style={[styles.rankNum, entry.rank === 1 && styles.rankNumFirst]}>
          #{entry.rank}
        </Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.username}>@{entry.username}</Text>
        {entry.text_content ? (
          <Text style={styles.entryText}>{entry.text_content}</Text>
        ) : entry.media_url ? (
          <Image source={{ uri: entry.media_url }} style={styles.entryImage} />
        ) : null}
      </View>
      <TouchableOpacity
        style={[
          styles.voteBtn,
          entry.viewer_has_voted && styles.voteBtnActive,
          (!canVote || voteInFlight) && styles.voteBtnDisabled,
        ]}
        onPress={onVote}
        disabled={!canVote || voteInFlight}
      >
        {voteInFlight ? (
          <ActivityIndicator size="small" color={entry.viewer_has_voted ? '#000' : '#fff'} />
        ) : (
          <>
            <Text style={[styles.voteBtnIcon, entry.viewer_has_voted && styles.voteBtnIconActive]}>
              ▲
            </Text>
            <Text style={[styles.voteBtnCount, entry.viewer_has_voted && styles.voteBtnCountActive]}>
              {entry.vote_count}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 8 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#fff' },
  headerCity: { fontSize: 13, color: '#666', marginTop: 2 },
  countdownLabel: { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 2, textAlign: 'right' },
  countdown: { fontSize: 20, fontWeight: '900', color: '#ff4444', fontVariant: ['tabular-nums'], textAlign: 'right' },

  prompt: { fontSize: 14, color: '#555', paddingHorizontal: 20, paddingBottom: 16, lineHeight: 20 },

  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },

  card: { flexDirection: 'row', backgroundColor: '#0d0d0d', borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a', overflow: 'hidden' },
  rank: { width: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  rankNum: { fontSize: 13, fontWeight: '800', color: '#444' },
  rankNumFirst: { color: '#ff4444' },
  cardContent: { flex: 1, padding: 14, gap: 6 },
  username: { fontSize: 12, color: '#555', fontWeight: '600' },
  entryText: { fontSize: 16, color: '#fff', lineHeight: 22 },
  entryImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8 },
  voteBtn: { width: 52, justifyContent: 'center', alignItems: 'center', gap: 2, borderLeftWidth: 1, borderLeftColor: '#1a1a1a' },
  voteBtnActive: { backgroundColor: '#fff' },
  voteBtnDisabled: { opacity: 0.4 },
  voteBtnIcon: { fontSize: 14, color: '#555' },
  voteBtnIconActive: { color: '#000' },
  voteBtnCount: { fontSize: 12, fontWeight: '700', color: '#555' },
  voteBtnCountActive: { color: '#000' },

  emptyIcon: { fontSize: 48, color: '#222' },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#444' },
  emptyText: { fontSize: 15, color: '#333', textAlign: 'center' },
});
