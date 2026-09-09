import { useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  StatusBar,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';

const SCREEN = Dimensions.get('screen');
const DISMISS_THRESHOLD = 120;
const MIN_SCALE = 1;
const MAX_SCALE = 5;

function getTouchDistance(touches: { pageX: number; pageY: number }[]) {
  const [a, b] = touches;
  return Math.sqrt(Math.pow(a.pageX - b.pageX, 2) + Math.pow(a.pageY - b.pageY, 2));
}

export function FullScreenMediaModal({
  visible,
  uri,
  type,
  onClose,
}: {
  visible: boolean;
  uri: string;
  type: string;
  onClose: () => void;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  // Mutable refs for gesture tracking (not state — no re-render needed)
  const baseScale = useRef(1);
  const currentScale = useRef(1); // tracks live scale value during pinch
  const lastDist = useRef<number | null>(null);
  const isPinching = useRef(false);

  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
      scale.setValue(1);
      baseScale.current = 1;
      currentScale.current = 1;
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  function dismiss() {
    Animated.parallel([
      Animated.timing(translateY, { toValue: SCREEN.height, duration: 250, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(onClose);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        // Always capture touch starts so we can count fingers
        return e.nativeEvent.touches.length >= 1;
      },
      onMoveShouldSetPanResponder: (e, g) => {
        if (e.nativeEvent.touches.length === 2) return true;
        return Math.abs(g.dy) > 10 && Math.abs(g.dy) > Math.abs(g.dx);
      },
      onPanResponderGrant: (e) => {
        if (e.nativeEvent.touches.length === 2) {
          isPinching.current = true;
          lastDist.current = getTouchDistance(e.nativeEvent.touches as any);
        } else {
          isPinching.current = false;
          lastDist.current = null;
        }
      },
      onPanResponderMove: (e, g) => {
        const touches = e.nativeEvent.touches as any[];
        if (touches.length === 2) {
          // Pinch zoom
          isPinching.current = true;
          const dist = getTouchDistance(touches);
          if (lastDist.current !== null) {
            const ratio = dist / lastDist.current;
            const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, baseScale.current * ratio));
            currentScale.current = newScale;
            scale.setValue(newScale);
          }
          lastDist.current = dist;
        } else if (!isPinching.current && g.dy > 0) {
          // Swipe to dismiss (only when not zoomed in)
          if (baseScale.current <= 1) {
            translateY.setValue(g.dy);
          }
        }
      },
      onPanResponderRelease: (e, g) => {
        if (isPinching.current) {
          // Save current scale as new base for next gesture
          baseScale.current = currentScale.current;
          // Snap back to 1 if under-pinched below min
          if (baseScale.current <= 1) {
            baseScale.current = 1;
            currentScale.current = 1;
            Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
          }
          isPinching.current = false;
          lastDist.current = null;
        } else {
          // Dismiss or snap back
          if (g.dy > DISMISS_THRESHOLD || g.vy > 1.5) {
            dismiss();
          } else {
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
          }
        }
      },
    })
  ).current;

  // Tap handler to reset zoom
  function resetZoom() {
    baseScale.current = 1;
    currentScale.current = 1;
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      <Animated.View
        style={[styles.container, { transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity style={styles.closeBtn} onPress={dismiss} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        {type === 'video' ? (
          <Video
            source={{ uri }}
            style={styles.media}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping
            useNativeControls
          />
        ) : (
          <Animated.Image
            source={{ uri }}
            style={[styles.media, { transform: [{ scale }] }]}
            resizeMode="contain"
          />
        )}

        {type !== 'video' && (
          <View style={styles.zoomHint} pointerEvents="none">
            <Text style={styles.zoomHintText}>Pinch to zoom · Double-tap to reset</Text>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: (StatusBar.currentHeight ?? 44) + 12,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  media: {
    width: SCREEN.width,
    height: SCREEN.height,
  },
  zoomHint: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
  },
  zoomHintText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    fontWeight: '600',
  },
});
