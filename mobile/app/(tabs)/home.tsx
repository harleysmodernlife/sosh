import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import type { User, Pulse, Trophy, ResolvedPulse, MosaicEntry } from '@/lib/types';
import { useCountdown } from '@/components/useCountdown';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TILE_SIZE = (SCREEN_WIDTH - 40 - 9) / 4; // 4 cols, 3 gaps of 3px, outer padding 20

export default function HomeScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [lastPulse, setLastPulse] = useState<ResolvedPulse | null>(null);
  const [mosaic, setMosaic] = useState<MosaicEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const [me, activePulse, myTrophies, resolved] = await Promise.all([
        api.users.me(),
        api.pulses.active(),
        api.trophies.mine(),
        api.pulses.resolved(),
      ]);
      setUser(me);
      setPulse(activePulse);
      setTrophies(myTrophies);

      const latest = resolved[0] ?? null;
      setLastPulse(latest);
      if (latest?.has_mosaic) {
        const entries = await api.pulses.mosaic(latest.id);
        setMosaic(entries);
      } else {
        setMosaic([]);
      }
    } catch (err) {
      // Session may have expired — let root layout handle redirect
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>SÖSH</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOut}>sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Score card */}
      {user && (
        <View style={styles.scoreCard}>
          <Text style={styles.username}>@{user.username ?? 'setup your username'}</Text>
          {user.city && <Text style={styles.city}>{user.city}</Text>}
          <Text style={styles.scoreLabel}>SÖSH SCORE</Text>
          <Text style={styles.scoreValue}>{user.sosh_score}</Text>
          <Text style={styles.trophyCount}>
            {user.trophy_count} {user.trophy_count === 1 ? 'trophy' : 'trophies'}
          </Text>
        </View>
      )}

      {/* Active Pulse banner */}
      {pulse && (pulse.status === 'active' || pulse.status === 'voting') ? (
        <PulseBanner pulse={pulse} />
      ) : (
        <View style={styles.quietCard}>
          <Text style={styles.quietLabel}>BETWEEN PULSES</Text>
          <Text style={styles.quietText}>
            The next Pulse can fire at any moment. Stay ready.
          </Text>
        </View>
      )}

      {/* Recent trophies */}
      {trophies.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>TROPHY CASE</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
              <Text style={styles.seeAll}>see all →</Text>
            </TouchableOpacity>
          </View>
          {trophies.slice(0, 3).map(t => (
            <View key={t.id} style={styles.trophyRow}>
              <View style={styles.trophyIcon}>
                <Text style={styles.trophyIconText}>🏆</Text>
              </View>
              <View style={styles.trophyInfo}>
                <Text style={styles.trophyTitle}>
                  {t.city ?? 'Global'} City Rep
                </Text>
                <Text style={styles.trophyPrompt} numberOfLines={1}>
                  "{t.prompt}"
                </Text>
                <Text style={styles.trophyVotes}>{t.vote_count} votes</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {trophies.length === 0 && (
        <View style={styles.emptyTrophies}>
          <Text style={styles.emptyTrophiesText}>No trophies yet.</Text>
          <Text style={styles.emptyTrophiesHint}>
            Win a Pulse to earn your first City Rep title.
          </Text>
        </View>
      )}

      {/* Mosaic — last resolved Pulse */}
      {lastPulse && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>LAST PULSE</Text>
          </View>
          <View style={styles.mosaicMeta}>
            <Text style={styles.mosaicPrompt} numberOfLines={2}>
              "{lastPulse.prompt}"
            </Text>
            {lastPulse.winner_display_name || lastPulse.winner_username ? (
              <Text style={styles.mosaicWinner}>
                Won by @{lastPulse.winner_username ?? lastPulse.winner_display_name}
                {lastPulse.winner_votes != null ? `  ·  ${lastPulse.winner_votes} votes` : ''}
              </Text>
            ) : null}
          </View>

          {mosaic.length > 0 ? (
            <View style={styles.mosaicGrid}>
              {mosaic.map((entry) => (
                <MosaicTile key={entry.id} entry={entry} />
              ))}
            </View>
          ) : (
            <View style={styles.mosaicEmpty}>
              <Text style={styles.mosaicEmptyText}>No entries yet.</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function PulseBanner({ pulse }: { pulse: Pulse }) {
  const endsAt = pulse.status === 'active'
    ? pulse.submission_ends_at
    : pulse.voting_ends_at;
  const countdown = useCountdown(endsAt);

  return (
    <TouchableOpacity onPress={() => router.push('/(tabs)/pulse')} activeOpacity={0.85}>
      <LinearGradient
        colors={pulse.status === 'active' ? ['#ff4444', '#cc0000'] : ['#ff8800', '#cc5500']}
        style={styles.pulseBanner}
      >
        <Text style={styles.pulseLiveLabel}>
          {pulse.status === 'active' ? '⚡ PULSE IS LIVE' : '🗳 VOTING OPEN'}
        </Text>
        <Text style={styles.pulsePrompt}>"{pulse.prompt}"</Text>
        {countdown && (
          <Text style={styles.pulseCountdown}>{countdown} remaining</Text>
        )}
        <Text style={styles.pulseCta}>
          {pulse.status === 'active' ? 'Tap to respond →' : 'Tap to vote →'}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function MosaicTile({ entry }: { entry: MosaicEntry }) {
  if (entry.media_url) {
    return (
      <View style={styles.mosaicTile}>
        <Image source={{ uri: entry.media_url }} style={styles.mosaicTileImage} />
      </View>
    );
  }
  return (
    <View style={[styles.mosaicTile, styles.mosaicTileText]}>
      <Text style={styles.mosaicTileTextContent} numberOfLines={4}>
        {entry.text_content}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingTop: 60, gap: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  wordmark: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 6 },
  signOut: { color: '#555', fontSize: 13 },

  scoreCard: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  username: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 2 },
  city: { fontSize: 13, color: '#666', marginBottom: 16 },
  scoreLabel: { fontSize: 10, fontWeight: '700', color: '#555', letterSpacing: 3, marginBottom: 4 },
  scoreValue: { fontSize: 52, fontWeight: '900', color: '#fff', lineHeight: 56 },
  trophyCount: { fontSize: 13, color: '#555', marginTop: 4 },

  pulseBanner: { borderRadius: 16, padding: 20, gap: 8 },
  pulseLiveLabel: { fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 2 },
  pulsePrompt: { fontSize: 22, fontWeight: '700', color: '#fff', lineHeight: 28 },
  pulseCountdown: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontVariant: ['tabular-nums'] },
  pulseCta: { fontSize: 14, color: '#fff', fontWeight: '600', marginTop: 4 },

  quietCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    gap: 8,
  },
  quietLabel: { fontSize: 10, fontWeight: '700', color: '#333', letterSpacing: 3 },
  quietText: { fontSize: 15, color: '#444', lineHeight: 22 },

  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#555', letterSpacing: 3 },
  seeAll: { fontSize: 12, color: '#555' },

  trophyRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  trophyIcon: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  trophyIconText: { fontSize: 22 },
  trophyInfo: { flex: 1, gap: 2 },
  trophyTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  trophyPrompt: { fontSize: 12, color: '#555' },
  trophyVotes: { fontSize: 11, color: '#444', marginTop: 2 },

  emptyTrophies: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyTrophiesText: { fontSize: 16, color: '#444' },
  emptyTrophiesHint: { fontSize: 13, color: '#333', textAlign: 'center' },

  mosaicMeta: { gap: 4, marginBottom: 10 },
  mosaicPrompt: { fontSize: 16, fontWeight: '700', color: '#fff', lineHeight: 22 },
  mosaicWinner: { fontSize: 12, color: '#555' },
  mosaicGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  mosaicTile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  mosaicTileImage: { width: '100%', height: '100%' },
  mosaicTileText: {
    padding: 4,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  mosaicTileTextContent: { fontSize: 8, color: '#666', lineHeight: 11 },
  mosaicEmpty: { paddingVertical: 20, alignItems: 'center' },
  mosaicEmptyText: { fontSize: 13, color: '#333' },
});
