import { Text, TextStyle } from 'react-native';

const MENTION_RE = /(@[a-zA-Z0-9_]+)/g;

/**
 * Renders text with @mentions highlighted in the provided accent color.
 * Mentions are not tappable — the notification is the navigation surface.
 */
export function MentionText({
  text,
  style,
  mentionColor = '#5ba3e0',
  numberOfLines,
}: {
  text: string;
  style?: TextStyle | TextStyle[];
  mentionColor?: string;
  numberOfLines?: number;
}) {
  const parts = text.split(MENTION_RE);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) =>
        MENTION_RE.test(part) ? (
          <Text key={i} style={{ color: mentionColor, fontWeight: '700' }}>{part}</Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}
