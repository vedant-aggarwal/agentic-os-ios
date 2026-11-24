import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import { useNow } from '../thread/ui';
import { NEEDS } from './tokens';

// Above a reply box: is Claude's prompt cache still warm? It lives about an hour after the last turn. Once it runs
// out, the next message re-reads the whole chat at full price, so he sees that before he types, not after.
// The PC still checks on send (428) and asks "Send anyway?".

type Cache = { state: 'warm' | 'cold' | 'none'; warmUntil: string | null; tokens?: number | null; keepWarmUntil?: string | null };

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function cacheLine(c: Cache | null | undefined, now: number): { text: string; cold: boolean } | null {
  if (!c || c.state === 'none' || !c.warmUntil) return null;
  const until = Date.parse(c.warmUntil);
  if (!Number.isFinite(until)) return null;
  const kept = c.keepWarmUntil ? Date.parse(c.keepWarmUntil) : NaN;
  if (c.state === 'warm' && kept > now) return { text: `Cache kept warm until ${clock(kept)}`, cold: false };
  const left = Math.round((until - now) / 60_000);
  const size = c.tokens ? ` (about ${Math.round(c.tokens / 1000)}k tokens)` : '';
  if (c.state === 'cold' || left <= 0) {
    return { text: `Cache went cold at ${clock(until)}. Your next message re-reads the whole chat${size} at full price.`, cold: true };
  }
  return { text: left <= 10 ? `Cache warm for ${left} more min. Reply now to keep it cheap.` : `Cache warm for ${left} more min`, cold: false };
}

/** Hidden while the agent works (its cache is in use) and when there is no session yet. */
export function CacheChip({ cache, working }: { cache: Cache | null | undefined; working: boolean }) {
  const now = useNow(!working && !!cache?.warmUntil, 30_000);
  const line = working ? null : cacheLine(cache, now);
  if (!line) return null;
  return (
    <View style={[s.chip, line.cold && s.cold]} accessibilityLiveRegion="polite">
      <View style={[s.dot, { backgroundColor: line.cold ? NEEDS : 'rgba(161,166,174,0.7)' }]} />
      <Text style={[s.text, line.cold && s.coldText]}>{line.text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cold: { backgroundColor: 'rgba(255,161,92,0.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,161,92,0.45)' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { flex: 1, fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.faint },
  coldText: { color: C.textSoft },
});
