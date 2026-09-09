import { Text, TextStyle } from 'react-native';
import { router } from 'expo-router';

// Matches @mentions and #hashtags (hashtags must start with a letter)
const TOKEN_RE = /(@[a-zA-Z0-9_]+|#[a-zA-Z][a-zA-Z0-9_]*)/g;

export function MentionText({
  text,
  style,
  mentionColor = '#5ba3e0',
  hashtagColor = '#06D6A0',
  numberOfLines,
}: {
  text: string;
  style?: TextStyle | TextStyle[];
  mentionColor?: string;
  hashtagColor?: string;
  numberOfLines?: number;
}) {
  const parts = text.split(TOKEN_RE);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) => {
        if (/^@[a-zA-Z0-9_]+$/.test(part)) {
          return (
            <Text key={i} style={{ color: mentionColor, fontWeight: '700' }}>
              {part}
            </Text>
          );
        }
        if (/^#[a-zA-Z][a-zA-Z0-9_]*$/.test(part)) {
          return (
            <Text
              key={i}
              style={{ color: hashtagColor, fontWeight: '700' }}
              onPress={() => router.push(`/hashtag/${part.slice(1)}` as any)}
            >
              {part}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}
