import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chevron } from '../Icons';
import { Press } from '../Press';
import { compact, useHome, useProfiles, useReels, type Post } from '@/lib/api';
import { STAGE_INFO, nextStage, workingLabel } from '@/lib/reels';
import { C, F } from '@/theme';

/** What the channel promises, what has worked there (tap a post for its page) and the reels in production. */
export function ChannelContext({ channelId }: { channelId: string }) {
  const { data } = useHome();
  const profiles = useProfiles();
  const { reels } = useReels();
  const ch = data?.channels.find((c) => c.id === channelId);
  const prof = profiles?.find((p) => p.id === channelId);
  const posts = (ch?.posts || []).filter((p) => p.status === 'published');
  const byViews = posts.filter((p) => p.views != null).sort((a, b) => (b.views || 0) - (a.views || 0));
  const top: Post[] = (byViews.length ? byViews : posts).slice(0, 6);
  const making = (reels || []).filter((r) => r.channelId === channelId).slice(0, 4);
  const stats = [
    ch?.stats.followers != null ? `${compact(ch.stats.followers)} ${ch.platform === 'youtube' ? 'subscribers' : 'followers'}` : null,
    posts.length ? `${posts.length} posts` : null,
  ].filter(Boolean);
  const openPost = (p: Post) => router.push({ pathname: '/post/[id]', params: { id: channelId, at: p.at } });

  return (
    <View style={styles.ctx}>
      {prof?.promise ? <Text style={styles.promise}>{prof.promise}</Text> : null}
      {stats.length ? <Text style={styles.stats}>{stats.join(' · ')}</Text> : null}

      {top.length ? (
        <>
          <Text style={styles.label}>{byViews.length ? 'Best performing' : 'Latest posts'}</Text>
          {!top.some((p) => p.thumb) ? (
            // No cover images known (Instagram schedule entries): a plain list reads better than empty boxes.
            <View style={{ gap: 6 }}>
              {top.slice(0, 4).map((p, i) => (
                <Press key={p.at + i} style={styles.row} scale={0.98} onPress={() => openPost(p)} accessibilityLabel={`Open ${p.title}`}>
                  <Text numberOfLines={1} style={[styles.postTitle, { flex: 1, marginTop: 0 }]}>{p.title}</Text>
                  {p.views != null ? <Text style={[styles.views, { marginTop: 0 }]}>{compact(p.views)}</Text> : null}
                  <Chevron size={14} color={C.faint} dir="right" />
                </Press>
              ))}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -14 }}>
              <View style={{ width: 6 }} />
              {top.map((p, i) => (
                <Press key={p.at + i} style={styles.post} scale={0.96} onPress={() => openPost(p)} accessibilityLabel={`Open ${p.title}`}>
                  {p.thumb ? <Image source={p.thumb} style={styles.thumb} contentFit="cover" /> : <View style={[styles.thumb, { backgroundColor: C.empty }]} />}
                  <Text numberOfLines={2} style={styles.postTitle}>{p.title}</Text>
                  {p.views != null ? <Text style={styles.views}>{compact(p.views)} views</Text> : null}
                </Press>
              ))}
              <View style={{ width: 6 }} />
            </ScrollView>
          )}
        </>
      ) : (
        <Text style={styles.stats}>Nothing posted yet. Concepts come from the channel's promise and audience.</Text>
      )}

      {making.length ? (
        <>
          <Text style={styles.label}>In production</Text>
          <View style={{ gap: 6 }}>
            {making.map((r) => {
              const next = nextStage(r.stage);
              return (
                <Press key={r.id} style={styles.row} scale={0.98} onPress={() => router.push(`/reel/${r.id}`)} accessibilityLabel={`Open reel ${r.title}`}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.postTitle, { marginTop: 0 }]}>{r.title}</Text>
                    <Text style={styles.sub}>{r.working ? workingLabel(r.working) : next ? `Next: ${STAGE_INFO[next].name}` : 'Done'}</Text>
                  </View>
                  <Chevron size={14} color={C.faint} dir="right" />
                </Press>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ctx: { marginTop: 12, padding: 14, borderRadius: 20, backgroundColor: C.card },
  promise: { fontFamily: F.s, fontSize: 15, lineHeight: 21, color: C.ink },
  stats: { marginTop: 4, fontFamily: F.m, fontSize: 13, lineHeight: 18, color: C.muted },
  label: { marginTop: 12, marginBottom: 8, fontFamily: F.s, fontSize: 13, lineHeight: 18, color: C.ink2 },
  post: { width: 104 },
  thumb: { width: 104, height: 138, borderRadius: 12 },
  postTitle: { marginTop: 6, fontFamily: F.m, fontSize: 13, lineHeight: 17, color: C.ink },
  views: { marginTop: 2, fontFamily: F.b, fontSize: 12, lineHeight: 16, color: C.ink },
  sub: { fontFamily: F.r, fontSize: 12, lineHeight: 16, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: C.bg },
});
