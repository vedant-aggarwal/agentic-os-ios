import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Failed, Skeleton } from '@/aspects/kit';
import { line, type LineCall, type LineCallSummary } from '@/lib/line';
import { CallDetail } from './CallDetail';
import { LiveCall } from './LiveCall';
import { errText, LineScreen, LineTop } from './parts';

// /line/<callId>: the live screen while the call is on, the call's page once it has ended (and the switch from one to
// the other when it ends while he watches). `?take=1` or `?listen=1` (a notification's or the Live Activity's button)
// takes the call over or starts listening as soon as the PC confirms the call is still on.

const asCall = (c: LineCallSummary): LineCall => ({ ...c, summary: '', outcome: '', actions: [], transcript: [], noraCallId: null });

export function CallRoute() {
  const p = useLocalSearchParams<{ id: string; take?: string; listen?: string }>();
  const id = (Array.isArray(p.id) ? p.id[0] : p.id) ?? '';
  const start = p.take ? 'take' : p.listen ? 'listen' : null;
  const [call, setCall] = useState<LineCall | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let on = true;
    line.call(id).then((c) => { if (on) setCall(c); }, async (e) => {
      // a call still on that the PC can't give as a record yet: the live screen runs from the line's status
      const now = await line.status().then((s) => s.live, () => null);
      if (!on) return;
      if (now && now.id === id) setCall(asCall(now)); else setError(errText(e));
    });
    return () => { on = false; };
  }, [id, attempt]);
  const retry = () => { setError(null); setAttempt((n) => n + 1); };

  // the live screen saw it end: the call's page, even if the PC's record still says it's on for a moment
  const ended = useCallback(async () => {
    const at = new Date().toISOString();
    const fresh = await line.call(id).catch(() => null);
    setCall((was) => {
      const c = fresh ?? was;
      if (!c) return c;
      return { ...c, phase: 'ended', endedAt: c.endedAt ?? at };
    });
  }, [id]);

  if (call) return call.phase === 'ended' ? <CallDetail call={call} /> : <LiveCall call={call} start={start} onEnded={() => void ended()} />;
  return <Waiting error={error} onRetry={retry} />;
}

function Waiting({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <LineScreen>
      <View style={[s.page, { paddingTop: insets.top + 8 }]}>
        <LineTop backLabel="Calls" />
        {error ? <Failed message={error} onRetry={onRetry} /> : (
          <View style={s.skel}>
            <Skeleton height={72} width={72} radius={36} />
            <Skeleton height={28} width="60%" />
            <Skeleton height={16} width="40%" />
            <View style={s.gap} />
            <Skeleton height={64} radius={16} />
            <Skeleton height={140} radius={20} />
          </View>
        )}
      </View>
    </LineScreen>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 16, gap: 16 },
  skel: { alignItems: 'center', gap: 10, paddingTop: 4 },
  gap: { height: 12 },
});
