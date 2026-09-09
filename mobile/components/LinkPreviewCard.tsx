import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { api } from '@/lib/api';

const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

export function extractFirstUrl(text: string): string | null {
  const matches = text.match(URL_RE);
  return matches?.[0] ?? null;
}

interface Preview {
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
}

export function LinkPreviewCard({ url }: { url: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    api.linkPreview.get(url)
      .then(p => { if (!cancelled) setPreview(p); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <View style={styles.skeleton}>
        <ActivityIndicator size="small" color="#333" />
      </View>
    );
  }

  if (failed || !preview || (!preview.title && !preview.description)) {
    return null;
  }

  const domain = preview.site_name || new URL(url).hostname.replace(/^www\./, '');

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => Linking.openURL(url)}
      activeOpacity={0.85}
    >
      {preview.image_url ? (
        <Image source={{ uri: preview.image_url }} style={styles.image} resizeMode="cover" />
      ) : null}
      <View style={styles.body}>
        <Text style={styles.domain} numberOfLines={1}>{domain}</Text>
        {preview.title ? (
          <Text style={styles.title} numberOfLines={2}>{preview.title}</Text>
        ) : null}
        {preview.description ? (
          <Text style={styles.description} numberOfLines={2}>{preview.description}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    height: 60, borderRadius: 10, backgroundColor: '#0d0d0d',
    justifyContent: 'center', alignItems: 'center',
    marginTop: 10, borderWidth: 1, borderColor: '#1a1a1a',
  },
  card: {
    marginTop: 10, borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: '#1a1a1a', backgroundColor: '#0a0a0a',
  },
  image: { width: '100%', height: 160 },
  body: { padding: 10, gap: 3 },
  domain: { fontSize: 11, color: '#444', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 14, fontWeight: '700', color: '#ddd', lineHeight: 19 },
  description: { fontSize: 12, color: '#555', lineHeight: 17 },
});
