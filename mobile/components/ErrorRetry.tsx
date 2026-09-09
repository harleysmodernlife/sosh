import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export function ErrorRetry({
  message = 'Could not load content.',
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠</Text>
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity style={styles.btn} onPress={onRetry} activeOpacity={0.8}>
        <Text style={styles.btnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: '#000',
  },
  icon: { fontSize: 28, color: '#444' },
  message: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20 },
  btn: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 18,
  },
  btnText: { fontSize: 13, fontWeight: '700', color: '#888' },
});
