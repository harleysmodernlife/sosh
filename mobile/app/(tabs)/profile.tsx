import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Dimensions,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import type { User, Trophy, MyEntry } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [entries, setEntries] = useState<MyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editVisible, setEditVisible] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  async function load() {
    try {
      const [me, myTrophies, myEntries] = await Promise.all([
        api.users.me(),
        api.trophies.mine(),
        api.users.myEntries(),
      ]);
      setUser(me);
      setTrophies(myTrophies);
      setEntries(myEntries);
    } catch {}
    finally { setLoading(false); }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>;
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>
              {(user?.username ?? user?.display_name ?? '?')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            {user?.display_name
              ? <Text style={styles.displayName}>{user.display_name}</Text>
              : null}
            <Text style={styles.username}>@{user?.username ?? '—'}</Text>
            {user?.city && <Text style={styles.location}>{user.city}</Text>}
          </View>
          <View style={styles.headerActions}>
            {user?.is_admin && (
              <TouchableOpacity style={styles.adminBtn} onPress={() => router.push('/admin')}>
                <Text style={styles.adminBtnText}>Admin</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditVisible(true)}>
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Score */}
        <View style={styles.scoreRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{user?.sosh_score ?? 0}</Text>
            <Text style={styles.statLabel}>SÖSH SCORE</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{entries.length}</Text>
            <Text style={styles.statLabel}>ENTRIES</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{trophies.length}</Text>
            <Text style={styles.statLabel}>TROPHIES</Text>
          </View>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        {/* My Entries */}
        {entries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MY ENTRIES</Text>
            {entries.map(e => <MyEntryCard key={e.id} entry={e} />)}
          </View>
        )}

        {/* Trophy Case */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TROPHY CASE</Text>

          {trophies.length === 0 ? (
            <View style={styles.emptyTrophies}>
              <Text style={styles.emptyTrophyIcon}>🏆</Text>
              <Text style={styles.emptyTrophyText}>No trophies yet</Text>
              <Text style={styles.emptyTrophyHint}>
                Win a Pulse to earn your first City Rep title.
              </Text>
            </View>
          ) : (
            trophies.map(t => <TrophyCard key={t.id} trophy={t} />)
          )}
        </View>
      </ScrollView>

      <EditProfileModal
        visible={editVisible}
        user={user}
        onClose={() => setEditVisible(false)}
        onSave={updated => { setUser(updated); setEditVisible(false); }}
      />
    </>
  );
}

function MyEntryCard({ entry }: { entry: MyEntry }) {
  const isActive = entry.pulse_status === 'active' || entry.pulse_status === 'voting';
  const rankLabel = entry.pulse_status === 'resolved'
    ? `#${entry.rank}`
    : isActive ? 'Live' : '—';
  const rankIsWin = entry.rank === 1 && entry.pulse_status === 'resolved';

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryCardTop}>
        <View style={[styles.entryRankBadge, rankIsWin && styles.entryRankBadgeWin]}>
          <Text style={[styles.entryRank, rankIsWin && styles.entryRankWin]}>{rankLabel}</Text>
        </View>
        <View style={styles.entryMeta}>
          <Text style={styles.entryPrompt} numberOfLines={2}>"{entry.pulse_prompt}"</Text>
          {entry.pulse_city && <Text style={styles.entryCity}>{entry.pulse_city}</Text>}
        </View>
        <View style={styles.entryVoteBox}>
          <Text style={styles.entryVoteCount}>{entry.vote_count}</Text>
          <Text style={styles.entryVoteLabel}>votes</Text>
        </View>
      </View>

      {entry.text_content ? (
        <View style={styles.entryTextBox}>
          <Text style={styles.entryText} numberOfLines={3}>{entry.text_content}</Text>
        </View>
      ) : entry.media_url ? (
        <Image
          source={{ uri: entry.media_url }}
          style={styles.entryImage}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

function TrophyCard({ trophy }: { trophy: Trophy }) {
  const date = new Date(trophy.awarded_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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

function EditProfileModal({
  visible,
  user,
  onClose,
  onSave,
}: {
  visible: boolean;
  user: User | null;
  onClose: () => void;
  onSave: (u: User) => void;
}) {
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await api.users.update({
        display_name: displayName || undefined,
        city: city || undefined,
      });
      onSave(updated);
    } catch (err: any) {
      Alert.alert('Could not save', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Edit Profile</Text>
          <TouchableOpacity onPress={save} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.modalSave}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.modalFields}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
            <TextInput
              style={styles.fieldInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="How you want to be known"
              placeholderTextColor="#444"
              maxLength={50}
            />
            <Text style={styles.fieldHint}>Shown on your entries alongside @{user?.username}</Text>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>CITY</Text>
            <TextInput
              style={styles.fieldInput}
              value={city}
              onChangeText={setCity}
              placeholder="Nashville"
              placeholderTextColor="#444"
              autoCapitalize="words"
              maxLength={100}
            />
            <Text style={styles.fieldHint}>Your city leaderboard — contact support to change</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingTop: 60, gap: 20, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },

  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  avatarLetter: { fontSize: 26, fontWeight: '800', color: '#fff' },
  profileInfo: { flex: 1, gap: 2 },
  displayName: { fontSize: 18, fontWeight: '700', color: '#fff' },
  username: { fontSize: 13, color: '#555' },
  location: { fontSize: 13, color: '#444' },
  headerActions: { flexDirection: 'row', gap: 8 },
  adminBtn: { backgroundColor: '#1a1a0a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#443' },
  adminBtnText: { color: '#cc0', fontSize: 13, fontWeight: '600' },
  editBtn: { backgroundColor: '#1a1a1a', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
  editBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  scoreRow: { flexDirection: 'row', backgroundColor: '#0d0d0d', borderRadius: 16, borderWidth: 1, borderColor: '#1a1a1a', overflow: 'hidden' },
  statBox: { flex: 1, padding: 20, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 36, fontWeight: '900', color: '#fff' },
  statLabel: { fontSize: 10, fontWeight: '700', color: '#444', letterSpacing: 2 },
  statDivider: { width: 1, backgroundColor: '#1a1a1a', marginVertical: 16 },

  section: { gap: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#444', letterSpacing: 3 },

  emptyTrophies: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTrophyIcon: { fontSize: 40 },
  emptyTrophyText: { fontSize: 16, color: '#444' },
  emptyTrophyHint: { fontSize: 13, color: '#333', textAlign: 'center' },

  // My Entry cards
  entryCard: { backgroundColor: '#0d0d0d', borderRadius: 14, borderWidth: 1, borderColor: '#1a1a1a', padding: 16, gap: 12 },
  entryCardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  entryRankBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#111', borderWidth: 1, borderColor: '#222', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  entryRankBadgeWin: { backgroundColor: '#1a1500', borderColor: '#443300' },
  entryRank: { fontSize: 13, fontWeight: '800', color: '#555' },
  entryRankWin: { color: '#cc9900' },
  entryMeta: { flex: 1, gap: 3 },
  entryPrompt: { fontSize: 13, color: '#555', fontStyle: 'italic', lineHeight: 18 },
  entryCity: { fontSize: 11, color: '#333' },
  entryVoteBox: { alignItems: 'center', gap: 1 },
  entryVoteCount: { fontSize: 20, fontWeight: '900', color: '#fff' },
  entryVoteLabel: { fontSize: 9, fontWeight: '700', color: '#444', letterSpacing: 1 },
  entryTextBox: { backgroundColor: '#111', borderRadius: 8, padding: 12 },
  entryText: { fontSize: 16, color: '#ccc', lineHeight: 22 },
  entryImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8 },

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

  signOutBtn: { paddingVertical: 14, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#1a1a1a' },
  signOutText: { color: '#444', fontSize: 14, fontWeight: '600' },

  modalContainer: { flex: 1, backgroundColor: '#000' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#111' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  modalCancel: { fontSize: 15, color: '#555' },
  modalSave: { fontSize: 15, fontWeight: '700', color: '#fff' },
  modalFields: { padding: 20, gap: 20 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#444', letterSpacing: 3 },
  fieldInput: { backgroundColor: '#111', borderWidth: 1, borderColor: '#222', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, color: '#fff', fontSize: 16 },
  fieldHint: { fontSize: 11, color: '#333', marginTop: 2 },
});
