import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chevron, Eye, InstagramMark, YouTubeMark } from '@/components/Icons';
import { Press } from '@/components/Press';
import { Loading } from '@/components/States';
import { compact, istTime, useHome } from '@/lib/api';
import { dateLabel } from '@/lib/reels';
import { slotFor } from '@/lib/lineup';
import { C, F } from '@/theme';

/** One published post: cover, title, when it went out and how it did. Swipe back to return. */
export default function PostPage() {
  const { id, at } = useLocalSearchParams<{ id: string; at: string }>();
  const insets = useSafeAreaInsets();
  const { data } = useHome();
  const ch = data?.channels.find((c) => c.id === id);
  const post = ch?.posts?.find((p) => p.at === at);
  const slot = slotFor(String(id));
  const yt = ch?.platform === 'youtube';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
      <View style={styles.bar}>
        <Press style={styles.round} scale={0.92} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Chevron />
        </Press>
        <Text style={styles.barTitle}>{slot?.name || 'Post'}</Text>
        <View style={{ width: 44 }} />
      </View>

      {!data ? (
        <Loading />
      ) : !post ? (
        <Text style={styles.meta}>This post is no longer in the channel's recent list.</Text>
      ) : (
        <>
          {post.thumb ? <Image source={post.thumb} style={styles.cover} contentFit="cover" /> : null}
          <Text style={styles.title}>{post.title}</Text>
          <Text style={styles.meta}>
            {dateLabel(post.date)}, {istTime(post.at)}
            {post.status !== 'published' ? ` · ${post.status}` : ''}
          </Text>
          {post.views != null ? (
            <View style={styles.stat}>
              <Eye size={18} color={C.ink} />
              <Text style={styles.big}>{compact(post.views)}</Text>
              <Text style={styles.meta}>views</Text>
            </View>
          ) : null}
          {post.error ? <Text style={styles.err}>{post.error}</Text> : null}
          {post.url ? (
            <Press style={styles.open} scale={0.97} onPress={() => Linking.openURL(post.url!)} accessibilityLabel={`Open on ${yt ? 'YouTube' : 'Instagram'}`}>
              {yt ? <YouTubeMark size={22} /> : <InstagramMark size={18} />}
              <Text style={styles.openText}>Open on {yt ? 'YouTube' : 'Instagram'}</Text>
            </Press>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', height: 44 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, textAlign: 'center', fontFamily: F.b, fontSize: 18, lineHeight: 24, color: C.ink },
  cover: { marginTop: 16, alignSelf: 'center', width: 220, height: 390, borderRadius: 20 },
  title: { marginTop: 16, fontFamily: F.b, fontSize: 22, lineHeight: 28, color: C.ink },
  meta: { marginTop: 4, fontFamily: F.m, fontSize: 14, lineHeight: 20, color: C.muted },
  stat: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  big: { fontFamily: F.b, fontSize: 26, color: C.ink },
  err: { marginTop: 12, fontFamily: F.m, fontSize: 14, lineHeight: 20, color: '#B4232F' },
  open: { marginTop: 24, height: 52, borderRadius: 26, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  openText: { fontFamily: F.b, fontSize: 16, color: C.ink },
});
