import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '@/lib/api';
import type { User, Trophy } from '@/lib/types';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [u, t] = await Promise.all([
          api.users.get(id),
          api.trophies.forUser(id),
        ]);
        setUser(u);
        setTrophies(t);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>;
  }

  if (notFound || !user) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundText}>User not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>← Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarLetter}>
              {(user.username ?? user.display_name ?? '?')[0].toUpperCase()}
            </Text>
          )}
        </View>
        <Text style={styles.username}>@{user.username ?? '—'}</Text>
        {user.display_name && <Text style={styles.displayName}>{user.display_name}</Text>}
        {user.city && (
          <Text style={styles.location}>
            {user.city}{user.country_code ? `, ${user.country_code}` : ''}
          </Text>
        )}
      </View>

      <View style={styles.scoreRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{user.sosh_score}</Text>
          <Text style={styles.statLabel}>SÖSH SCORE</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{trophies.length}</Text>
          <Text style={styles.statLabel}>TROPHIES</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TROPHY CASE</Text>
        {trophies.length === 0 ? (
          <View style={styles.emptyTrophies}>
            <Text style={styles.emptyTrophyText}>No trophies yet</Text>
          </View>
        ) : (
          trophies.map(t => <TrophyCard key={t.id} trophy={t} />)
        )}
      </View>
    </ScrollView>
  );
}

function TrophyCard({ trophy }: { trophy: Trophy }) {
  const date = new Date(trophy.awarded_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingTop: 60, gap: 20, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', gap: 16 },

  header: { marginBottom: 8 },
  back: { fontSize: 24, color: '#555' },

  profileHeader: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 4, overflow: 'hidden' },
  avatarImage: { width: 72, height: 72, borderRadius: 36 },
  avatarLetter: { fontSize: 30, fontWeight: '800', color: '#fff' },
  username: { fontSize: 20, fontWeight: '800', color: '#fff' },
  displayName: { fontSize: 14, color: '#666' },
  location: { fontSize: 13, color: '#444' },

  scoreRow: { flexDirection: 'row', backgroundColor: '#0d0d0d', borderRadius: 16, borderWidth: 1, borderColor: '#1a1a1a', overflow: 'hidden' },
  statBox: { flex: 1, padding: 20, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 36, fontWeight: '900', color: '#fff' },
  statLabel: { fontSize: 10, fontWeight: '700', color: '#444', letterSpacing: 2 },
  statDivider: { width: 1, backgroundColor: '#1a1a1a', marginVertical: 16 },

  section: { gap: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#444', letterSpacing: 3 },

  emptyTrophies: { paddingVertical: 32, alignItems: 'center' },
  emptyTrophyText: { fontSize: 14, color: '#333' },

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

  notFoundText: { fontSize: 16, color: '#444' },
  backLink: { fontSize: 14, color: '#555' },
});
