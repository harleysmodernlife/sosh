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
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import type { User, Trophy } from '@/lib/types';

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editVisible, setEditVisible] = useState(false);

  async function load() {
    try {
      const [me, myTrophies] = await Promise.all([
        api.users.me(),
        api.trophies.mine(),
      ]);
      setUser(me);
      setTrophies(myTrophies);
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
            <Text style={styles.username}>@{user?.username ?? '—'}</Text>
            {user?.display_name && <Text style={styles.displayName}>{user.display_name}</Text>}
            {user?.city && (
              <Text style={styles.location}>{user.city}{user.country_code ? `, ${user.country_code}` : ''}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => setEditVisible(true)}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Score */}
        <View style={styles.scoreRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{user?.sosh_score ?? 0}</Text>
            <Text style={styles.statLabel}>SÖSH SCORE</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{trophies.length}</Text>
            <Text style={styles.statLabel}>TROPHIES</Text>
          </View>
        </View>

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
  const [countryCode, setCountryCode] = useState(user?.country_code ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await api.users.update({
        display_name: displayName || undefined,
        city: city || undefined,
        country_code: countryCode.toUpperCase().slice(0, 2) || undefined,
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
              placeholder="Your name"
              placeholderTextColor="#444"
              maxLength={50}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>CITY</Text>
            <TextInput
              style={styles.fieldInput}
              value={city}
              onChangeText={setCity}
              placeholder="Nashville"
              placeholderTextColor="#444"
              maxLength={100}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>COUNTRY CODE</Text>
            <TextInput
              style={styles.fieldInput}
              value={countryCode}
              onChangeText={setCountryCode}
              placeholder="US"
              placeholderTextColor="#444"
              maxLength={2}
              autoCapitalize="characters"
            />
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
  username: { fontSize: 18, fontWeight: '700', color: '#fff' },
  displayName: { fontSize: 14, color: '#888' },
  location: { fontSize: 13, color: '#555' },
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

  modalContainer: { flex: 1, backgroundColor: '#000' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#111' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  modalCancel: { fontSize: 15, color: '#555' },
  modalSave: { fontSize: 15, fontWeight: '700', color: '#fff' },
  modalFields: { padding: 20, gap: 20 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#444', letterSpacing: 3 },
  fieldInput: { backgroundColor: '#111', borderWidth: 1, borderColor: '#222', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, color: '#fff', fontSize: 16 },
});
