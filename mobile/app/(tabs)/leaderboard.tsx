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
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { LEADERBOARD_POLL_MS } from '@/constants/config';
import type { Pulse, Entry, LeaderboardEntry, ResolvedPulse } from '@/lib/types';
import { useCountdown } from '@/components/useCountdown';

export default function LeaderboardScreen() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [votingInFlight, setVotingInFlight] = useState<Set<string>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<(Entry & { rank: number }) | null>(null);
  const [lastResolved, setLastResolved] = useState<ResolvedPulse | null>(null);
  const [lastEntries, setLastEntries] = useState<Entry[]>([]);
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
      } else {
        // No active pulse — load last resolved for historical view
        const resolved = await api.pulses.resolved();
        if (resolved.length > 0) {
          setLastResolved(resolved[0]);
          const ents = await api.pulses.entries(resolved[0].id);
          setLastEntries(ents.sort((a, b) => b.vote_count - a.vote_count));
        }
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
    if (!lastResolved) {
      return (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>▲</Text>
          <Text style={styles.emptyTitle}>No Pulse active</Text>
          <Text style={styles.emptyText}>Rankings appear here when a Pulse is live.</Text>
        </View>
      );
    }
    const rankedLast = lastEntries.map((e, i) => ({ ...e, rank: i + 1 }));
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Last Pulse</Text>
            {lastResolved.winner_username && (
              <Text style={styles.headerCity}>Won by @{lastResolved.winner_username}</Text>
            )}
          </View>
        </View>
        <Text style={styles.prompt} numberOfLines={3}>"{lastResolved.prompt}"</Text>
        <FlatList
          data={rankedLast}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <EntryCard
              entry={item}
              onVote={() => {}}
              onPress={() => setSelectedEntry(item)}
              voteInFlight={false}
              canVote={false}
            />
          )}
        />
        <EntryModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onVote={() => {}}
          voteInFlight={false}
          canVote={false}
        />
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
          <Text style={styles.emptyText}>No entries yet.{'\n'}Submit yours in the Pulse tab.</Text>
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
              onPress={() => setSelectedEntry(item)}
              voteInFlight={votingInFlight.has(item.id)}
              canVote={pulse.status === 'voting' || pulse.status === 'active'}
            />
          )}
        />
      )}

      <EntryModal
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
        onVote={e => vote(e)}
        voteInFlight={selectedEntry ? votingInFlight.has(selectedEntry.id) : false}
        canVote={pulse.status === 'voting' || pulse.status === 'active'}
      />
    </View>
  );
}

function MediaView({
  entry,
  style,
}: {
  entry: { content_type: string; media_url: string | null };
  style: object;
}) {
  if (!entry.media_url) return null;
  if (entry.content_type === 'video') {
    return (
      <Video
        source={{ uri: entry.media_url }}
        style={style}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        useNativeControls={false}
      />
    );
  }
  return <Image source={{ uri: entry.media_url }} style={style} resizeMode="cover" />;
}

function EntryCard({
  entry,
  onVote,
  onPress,
  voteInFlight,
  canVote,
}: {
  entry: Entry & { rank: number };
  onVote: () => void;
  onPress: () => void;
  voteInFlight: boolean;
  canVote: boolean;
}) {
  const isFirst = entry.rank === 1;
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[styles.card, isFirst && styles.cardFirst]}>
      <View style={[styles.rank, isFirst && styles.rankFirst]}>
        <Text style={[styles.rankNum, isFirst && styles.rankNumFirst]}>
          {isFirst ? '①' : `#${entry.rank}`}
        </Text>
      </View>
      <View style={styles.cardContent}>
        <View style={styles.entryMeta}>
          <Text style={styles.username}>
            {entry.display_name ?? `@${entry.username}`}
          </Text>
          {entry.display_name && (
            <Text style={styles.usernameHandle}>@{entry.username}</Text>
          )}
        </View>
        {entry.text_content ? (
          <Text style={styles.entryText}>{entry.text_content}</Text>
        ) : entry.media_url ? (
          <MediaView entry={entry} style={styles.entryImage} />
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
    </TouchableOpacity>
  );
}

function EntryModal({
  entry,
  onClose,
  onVote,
  voteInFlight,
  canVote,
}: {
  entry: (Entry & { rank: number }) | null;
  onClose: () => void;
  onVote: (e: Entry) => void;
  voteInFlight: boolean;
  canVote: boolean;
}) {
  const [reported, setReported] = useState(false);

  if (!entry) return null;

  async function handleReport() {
    if (reported || !entry) return;
    try {
      await api.reports.flagEntry(entry.id);
      setReported(true);
    } catch {}
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalClose}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.modalRank}>
            {entry.rank === 1 ? '① Ranked #1' : `Ranked #${entry.rank}`}
          </Text>
          <TouchableOpacity onPress={handleReport} disabled={reported}>
            <Text style={[styles.modalFlag, reported && styles.modalFlagDone]}>
              {reported ? 'Reported' : 'Flag'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent}>
          <TouchableOpacity onPress={() => { onClose(); router.push(`/user/${entry.user_id}`); }}>
            <Text style={styles.modalUsername}>
              {entry.display_name ?? `@${entry.username}`} →
            </Text>
            {entry.display_name && (
              <Text style={styles.modalUsernameHandle}>@{entry.username}</Text>
            )}
          </TouchableOpacity>

          {entry.media_url ? (
            <MediaView
              entry={entry}
              style={[styles.modalImage, { width: SCREEN_WIDTH - 40 }]}
            />
          ) : entry.text_content ? (
            <View style={styles.modalTextBox}>
              <Text style={styles.modalText}>{entry.text_content}</Text>
            </View>
          ) : null}

          <View style={styles.modalMeta}>
            <Text style={styles.modalVoteCount}>{entry.vote_count} votes</Text>
          </View>
        </ScrollView>

        {canVote && (
          <TouchableOpacity
            style={[styles.modalVoteBtn, entry.viewer_has_voted && styles.modalVoteBtnActive]}
            onPress={() => onVote(entry)}
            disabled={voteInFlight}
          >
            {voteInFlight ? (
              <ActivityIndicator color={entry.viewer_has_voted ? '#000' : '#fff'} />
            ) : (
              <Text style={[styles.modalVoteBtnText, entry.viewer_has_voted && styles.modalVoteBtnTextActive]}>
                {entry.viewer_has_voted ? '▲  Voted' : '▲  Vote'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </Modal>
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

  prompt: { fontSize: 15, color: '#666', paddingHorizontal: 20, paddingBottom: 16, lineHeight: 22, fontStyle: 'italic' },

  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },

  card: { flexDirection: 'row', backgroundColor: '#0d0d0d', borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a', overflow: 'hidden' },
  cardFirst: { backgroundColor: '#0f0e00', borderColor: '#2a2500' },
  rank: { width: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  rankFirst: { backgroundColor: '#0d0b00' },
  rankNum: { fontSize: 13, fontWeight: '800', color: '#3a3a3a' },
  rankNumFirst: { color: '#cc0', fontSize: 16 },
  cardContent: { flex: 1, padding: 14, gap: 6 },
  entryMeta: { gap: 1 },
  username: { fontSize: 13, color: '#ccc', fontWeight: '700' },
  usernameHandle: { fontSize: 11, color: '#444' },
  entryText: { fontSize: 16, color: '#ddd', lineHeight: 23 },
  entryImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8 },
  voteBtn: { width: 64, justifyContent: 'center', alignItems: 'center', gap: 2, borderLeftWidth: 1, borderLeftColor: '#1a1a1a' },
  voteBtnActive: { backgroundColor: '#fff' },
  voteBtnDisabled: { opacity: 0.35 },
  voteBtnIcon: { fontSize: 16, color: '#444' },
  voteBtnIconActive: { color: '#000' },
  voteBtnCount: { fontSize: 13, fontWeight: '800', color: '#444' },
  voteBtnCountActive: { color: '#000' },

  emptyIcon: { fontSize: 48, color: '#1a1a1a' },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#333' },
  emptyText: { fontSize: 15, color: '#2a2a2a', textAlign: 'center', lineHeight: 23 },

  modal: { flex: 1, backgroundColor: '#000' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#111' },
  modalClose: { color: '#555', fontSize: 15, width: 48 },
  modalRank: { fontSize: 14, fontWeight: '800', color: '#888', letterSpacing: 1 },
  modalContent: { padding: 20, gap: 16, paddingBottom: 40 },
  modalUsername: { fontSize: 17, fontWeight: '800', color: '#fff' },
  modalUsernameHandle: { fontSize: 12, color: '#555', marginTop: 1 },
  modalImage: { aspectRatio: 4 / 3, borderRadius: 12 },
  modalTextBox: { backgroundColor: '#0f0f0f', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#1a1a1a' },
  modalText: { fontSize: 22, color: '#fff', lineHeight: 32, fontWeight: '500' },
  modalMeta: { flexDirection: 'row', gap: 16 },
  modalVoteCount: { fontSize: 13, color: '#444', fontWeight: '600' },
  modalFlag: { color: '#555', fontSize: 13, fontWeight: '600', width: 56, textAlign: 'right' },
  modalFlagDone: { color: '#333' },
  modalVoteBtn: { margin: 16, borderRadius: 12, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  modalVoteBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },
  modalVoteBtnText: { color: '#666', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  modalVoteBtnTextActive: { color: '#000' },
});
