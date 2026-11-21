import { Image } from 'expo-image';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Eye, InstagramMark, YouTubeMark } from './Icons';
import { Press } from './Press';
import { compact, istTime, type Channel, type Post } from '@/lib/api';
import { C, F } from '@/theme';

/** One post: thumbnail, title, IST time, views, status. Tapping opens it on YouTube or Instagram. */
export function PostRow({ post, platform }: { post: Post; platform: Channel['platform'] }) {
  const color = platform === 'youtube' ? C.yt : C.ig;
  const badge =
    post.status === 'published'
      ? { text: 'Posted', bg: C.growBg, ink: C.growInk }
      : post.status === 'failed'
        ? { text: 'Failed', bg: '#FDE8EA', ink: '#B4232F' }
        : { text: 'Queued', bg: color + '1F', ink: color };

  return (
    <Press
      style={styles.row}
      disabled={!post.url}
      onPress={() => post.url && Linking.openURL(post.url)}
      accessibilityLabel={`${post.title}, ${badge.text}, ${istTime(post.at)}`}
    >
      {post.thumb ? (
        <Image source={{ uri: post.thumb }} style={styles.thumb} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>{platform === 'youtube' ? <YouTubeMark size={20} /> : <InstagramMark size={18} />}</View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={2} style={styles.title}>{post.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{istTime(post.at)}</Text>
          {post.views != null ? (
            <View style={styles.views}>
              <Eye size={12} color={C.muted} />
              <Text style={styles.meta}>{compact(post.views)}</Text>
            </View>
          ) : null}
        </View>
        {post.error ? <Text numberOfLines={2} style={styles.error}>{post.error}</Text> : null}
      </View>
      <View style={[styles.badge, { backgroundColor: badge.bg }]}>
        <Text style={[styles.badgeText, { color: badge.ink }]}>{badge.text}</Text>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 20, backgroundColor: C.card },
  thumb: { width: 48, height: 64, borderRadius: 10, backgroundColor: C.empty },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.s, fontSize: 15, lineHeight: 20, color: C.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meta: { fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.muted },
  views: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  error: { fontFamily: F.r, fontSize: 12, lineHeight: 16, color: '#B4232F' },
  badge: { height: 24, paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center' },
  badgeText: { fontFamily: F.b, fontSize: 12 },
});
