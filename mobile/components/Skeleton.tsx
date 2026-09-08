import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Dimensions } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

function SkeletonBox({ width, height, style }: { width: number | string; height: number; style?: object }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: 6, backgroundColor: '#1a1a1a', opacity },
        style,
      ]}
    />
  );
}

export function FeedSkeleton() {
  return (
    <View style={styles.feedContainer}>
      {[0, 1, 2].map(i => (
        <View key={i} style={styles.card}>
          <View style={styles.authorRow}>
            <SkeletonBox width={40} height={40} style={{ borderRadius: 20 }} />
            <View style={styles.authorInfo}>
              <SkeletonBox width={120} height={13} />
              <SkeletonBox width={70} height={11} style={{ marginTop: 5 }} />
            </View>
          </View>
          <SkeletonBox width={SCREEN_WIDTH} height={280} style={{ borderRadius: 0 }} />
          <View style={styles.actionsRow}>
            <SkeletonBox width={48} height={16} />
            <SkeletonBox width={48} height={16} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ProfileSkeleton() {
  const CELL = Math.floor(SCREEN_WIDTH / 3);
  return (
    <View style={styles.profileContainer}>
      <View style={styles.profileHeader}>
        <SkeletonBox width={80} height={80} style={{ borderRadius: 40 }} />
        <View style={{ gap: 8, flex: 1 }}>
          <SkeletonBox width={140} height={16} />
          <SkeletonBox width={90} height={13} />
        </View>
      </View>
      <View style={styles.statsRow}>
        {[0, 1, 2].map(i => (
          <View key={i} style={styles.statBox}>
            <SkeletonBox width={40} height={28} />
            <SkeletonBox width={60} height={10} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {Array.from({ length: 9 }).map((_, i) => (
          <SkeletonBox key={i} width={CELL} height={CELL} style={{ borderRadius: 0, margin: 0.25 }} />
        ))}
      </View>
    </View>
  );
}

export function SearchSkeleton() {
  return (
    <View style={styles.searchContainer}>
      {[0, 1, 2, 3, 4].map(i => (
        <View key={i} style={styles.searchRow}>
          <SkeletonBox width={46} height={46} style={{ borderRadius: 23 }} />
          <View style={{ flex: 1, gap: 7 }}>
            <SkeletonBox width={130} height={14} />
            <SkeletonBox width={80} height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function NotificationsSkeleton() {
  return (
    <View style={styles.feedContainer}>
      {[0, 1, 2, 3, 4].map(i => (
        <View key={i} style={styles.notifRow}>
          <SkeletonBox width={40} height={40} style={{ borderRadius: 20 }} />
          <View style={{ flex: 1, gap: 7 }}>
            <SkeletonBox width="80%" height={13} />
            <SkeletonBox width={60} height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function DMListSkeleton() {
  return (
    <View style={styles.feedContainer}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={styles.dmRow}>
          <SkeletonBox width={48} height={48} style={{ borderRadius: 24 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <SkeletonBox width={100} height={14} />
              <SkeletonBox width={36} height={11} />
            </View>
            <SkeletonBox width="70%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  feedContainer: { paddingTop: 8 },
  card: { borderBottomWidth: 1, borderBottomColor: '#111', paddingBottom: 16, marginTop: 16, gap: 12 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  authorInfo: { gap: 5, flex: 1 },
  actionsRow: { flexDirection: 'row', gap: 16, paddingHorizontal: 16 },

  profileContainer: { padding: 20, gap: 20 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statsRow: { flexDirection: 'row', backgroundColor: '#0d0d0d', borderRadius: 16, overflow: 'hidden' },
  statBox: { flex: 1, padding: 18, alignItems: 'center', gap: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -20 },

  searchContainer: { paddingTop: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#0d0d0d' },

  notifRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#0d0d0d' },

  dmRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#0d0d0d' },
});
