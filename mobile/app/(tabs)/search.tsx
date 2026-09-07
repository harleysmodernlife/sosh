import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const users = await api.users.search(q.trim());
        setResults(users);
        setSearched(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, []);

  function onChangeText(text: string) {
    setQuery(text);
    search(text);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SEARCH</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={onChangeText}
            placeholder="Search by username or name..."
            placeholderTextColor="#444"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {loading && <ActivityIndicator style={styles.spinner} color="#555" size="small" />}
        </View>
      </View>

      <FlatList
        data={results}
        keyExtractor={u => u.id}
        renderItem={({ item }) => <UserRow user={item} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          searched && !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No users found.</Text>
            </View>
          ) : !query.trim() ? (
            <View style={styles.empty}>
              <Text style={styles.emptyHint}>Find people by username or display name.</Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function UserRow({ user }: { user: User }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/user/${user.id}`)}
      activeOpacity={0.8}
    >
      <View style={[styles.avatar, user.accent_color ? { borderColor: user.accent_color } : undefined]}>
        {user.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} />
        ) : (
          <Text style={[styles.avatarLetter, user.accent_color ? { color: user.accent_color } : undefined]}>
            {(user.username ?? '?')[0].toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{user.display_name ?? `@${user.username}`}</Text>
        {user.display_name && user.username ? (
          <Text style={styles.handle}>@{user.username}</Text>
        ) : null}
        {user.city ? <Text style={styles.city}>{user.city}</Text> : null}
      </View>
      <View style={styles.score}>
        <Text style={[styles.scoreValue, user.accent_color ? { color: user.accent_color } : undefined]}>
          {user.sosh_score}
        </Text>
        <Text style={styles.scoreLabel}>pts</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  header: { paddingTop: 60, paddingHorizontal: 20, gap: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#111' },
  title: { fontSize: 13, fontWeight: '900', color: '#333', letterSpacing: 4 },

  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 14, paddingHorizontal: 16, gap: 8 },
  input: { flex: 1, height: 44, fontSize: 16, color: '#fff' },
  spinner: { marginRight: 4 },

  list: { paddingTop: 8, paddingBottom: 40 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#0d0d0d' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#222', overflow: 'hidden', flexShrink: 0 },
  avatarImg: { width: 46, height: 46, borderRadius: 23 },
  avatarLetter: { fontSize: 18, fontWeight: '800', color: '#fff' },

  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: '#fff' },
  handle: { fontSize: 12, color: '#555' },
  city: { fontSize: 12, color: '#444' },

  score: { alignItems: 'flex-end', gap: 1 },
  scoreValue: { fontSize: 16, fontWeight: '900', color: '#333' },
  scoreLabel: { fontSize: 10, color: '#333', fontWeight: '600' },

  empty: { paddingTop: 60, alignItems: 'center' },
  emptyText: { color: '#333', fontSize: 14 },
  emptyHint: { color: '#2a2a2a', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
