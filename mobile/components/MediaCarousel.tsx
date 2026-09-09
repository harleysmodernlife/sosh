import { useRef, useState } from 'react';
import {
  View,
  Image,
  FlatList,
  Dimensions,
  StyleSheet,
  NativeScrollEvent,
  NativeSyntheticEvent,
  TouchableOpacity,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { useMute } from '@/contexts/MuteContext';
import type { PostMediaItem } from '@/lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface Props {
  items: PostMediaItem[];
  height?: number;
  onPress?: () => void;
}

export function MediaCarousel({ items, height = SCREEN_WIDTH, onPress }: Props) {
  const [index, setIndex] = useState(0);
  const { muted } = useMute();

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    setIndex(Math.round(x / SCREEN_WIDTH));
  }

  if (items.length === 0) return null;

  if (items.length === 1) {
    return (
      <TouchableOpacity activeOpacity={0.95} onPress={onPress}>
        <SingleItem item={items[0]} height={height} muted={muted} />
      </TouchableOpacity>
    );
  }

  return (
    <View>
      <FlatList
        data={items}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={0.95} onPress={onPress}>
            <SingleItem item={item} height={height} muted={muted} />
          </TouchableOpacity>
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      />
      <View style={styles.dots}>
        {items.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

function SingleItem({
  item,
  height,
  muted,
}: {
  item: PostMediaItem;
  height: number;
  muted: boolean;
}) {
  if (item.type === 'video') {
    return (
      <Video
        source={{ uri: item.url }}
        style={{ width: SCREEN_WIDTH, height }}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        isMuted={muted}
        useNativeControls={false}
      />
    );
  }
  return (
    <Image
      source={{ uri: item.url }}
      style={{ width: SCREEN_WIDTH, height }}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  dots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
