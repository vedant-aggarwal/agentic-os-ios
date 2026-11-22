import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { C } from '@/theme';
import { call, fileSource, invalidate, upload } from '@/lib/mod';
import { Button, Card, CheckRing, Failed, Icon, Screen, Skeleton, SP, t, useAspect } from '@/aspects/kit';
import { B, dropScan, filePath, readScan, startScan, useRubric, type ScanSummary, type Shot } from '../api';
import { canPick, pickPhoto } from '../pick';
import { s as u, useSeen } from '../ui';

/**
 * The guided six-photo scan. Each photo goes to the PC as soon as it is chosen; the PC checks size, light and focus
 * and refuses a photo it can't score, with the reason. With all six in, the read starts in the background.
 */
export function ScanFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const rubric = useRubric(useSeen(open));
  const [scan, setScan] = useState<ScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // opening the flow finds the scan in progress, or starts one
  useEffect(() => {
    if (!open) return;
    let gone = false;
    startScan().then((r) => { if (!gone) { setScan(r.scan); setError(null); } }, (e: Error) => { if (!gone) setError(e.message); });
    return () => { gone = true; };
  }, [open, attempt]);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) { setRefused({}); setFocus(null); setBusy(null); } }

  const shots: readonly Shot[] = rubric.data?.shots ?? [];
  const photos = scan?.photos ?? {};
  const have = shots.filter((x) => photos[x.id]).length;
  const next = shots.find((x) => !photos[x.id])?.id ?? null;
  const current = focus ?? next;

  const choose = async (slot: string) => {
    if (!scan) return;
    try {
      const p = await pickPhoto();
      if (!p) return;
      setBusy(slot);
      setRefused((r) => { const n = { ...r }; delete n[slot]; return n; });
      const res = await upload<{ ok: boolean; scan: ScanSummary }>(`${B}/face/scans/${scan.id}/photo?slot=${slot}`, p.uri, p.type);
      setScan(res.scan);
      setFocus(null);
      invalidate(`${B}/`);
    } catch (e) {
      setRefused((r) => ({ ...r, [slot]: (e as Error).message }));
    }
    setBusy(null);
  };
  const remove = async (slot: string) => {
    if (!scan) return;
    try {
      const res = await call<{ scan: ScanSummary }>(`${B}/face/scans/${scan.id}/photo?slot=${slot}`, {}, 'DELETE');
      setScan(res.scan);
      setFocus(slot);
      invalidate(`${B}/`);
    } catch (e) { a.notice((e as Error).message); }
  };
  const read = async () => {
    if (!scan) return;
    setBusy('read');
    try { await readScan(scan.id); a.notice('Reading your photos. The scores land in Face in about two minutes.'); onClose(); }
    catch (e) { a.notice((e as Error).message); }
    setBusy(null);
  };
  const throwAway = async () => {
    if (!scan) return;
    try { await dropScan(scan.id); setScan(null); onClose(); } catch (e) { a.notice((e as Error).message); }
  };

  const loading = !error && (!scan || !rubric.data);
  return (
    <Screen open={open} onClose={onClose} title="Face scan" immersive
      right={scan && have > 0 ? <Button label="Throw away" kind="quiet" small onPress={() => { void throwAway(); }} /> : undefined}>
      {error ? <Failed message={error} onRetry={() => { setError(null); setAttempt((n) => n + 1); }} /> : null}
      {!error && rubric.error && !rubric.data ? <Failed message={rubric.error} onRetry={() => { void rubric.refresh(); }} /> : null}
      {loading && !rubric.error ? <View style={u.gap12}><Skeleton height={96} radius={24} /><Skeleton height={220} radius={24} /><Skeleton height={64} radius={24} /><Skeleton height={64} radius={24} /></View> : null}
      {!loading && scan && rubric.data ? (
        <>
          <View style={u.gap8}>
            <Text style={[t.title2, t.num]}>{have === 6 ? 'All six photos are in' : `Photo ${Math.min(6, have + 1)} of 6`}</Text>
            <Text style={t.small}>{rubric.data.light}</Text>
            <Text style={t.small}>{canPick ? 'Take each photo with the Camera app, then choose it here. Taking it from this screen comes with the next app build.' : 'Choosing photos comes with the next app build.'}</Text>
          </View>
          <View style={u.gap8}>
            {shots.map((x, i) => (
              <ShotCard key={x.id} n={i + 1} shot={x} file={photos[x.id] ?? null} refused={refused[x.id] ?? null} busy={busy === x.id} open={current === x.id}
                onOpen={() => setFocus(x.id)} onChoose={() => { void choose(x.id); }} onRemove={() => { void remove(x.id); }} />
            ))}
          </View>
          <Card style={u.gap12}>
            <Text style={t.body}>{have === 6 ? 'The PC reads them twice against the rubric and compares the reads. About two minutes; you can close this.' : `${6 - have} still to take. Photos stay on your PC.`}</Text>
            <Button label="Read my photos" kind="accent" disabled={have < 6} busy={busy === 'read'} onPress={() => { void read(); }} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function ShotCard({ n, shot, file, refused, busy, open, onOpen, onChoose, onRemove }: {
  n: number; shot: Shot; file: string | null; refused: string | null; busy: boolean; open: boolean; onOpen: () => void; onChoose: () => void; onRemove: () => void;
}) {
  const a = useAspect();
  const done = !!file;
  return (
    <Card tone={open && !done ? a.color : undefined} onPress={open ? undefined : onOpen} label={`${shot.name}, ${done ? 'taken' : 'not taken'}`} style={u.gap12}>
      <View style={u.row}>
        {done ? <Image source={fileSource(filePath(file, true))} style={[u.thumb, { width: 48, height: 60 }]} contentFit="cover" accessibilityLabel={`${shot.name} photo`} />
          : <View style={[u.thumb, { width: 48, height: 60, alignItems: 'center', justifyContent: 'center' }]}><Text style={[t.label, t.num]}>{n}</Text></View>}
        <View style={[u.flex, u.gap4]}>
          <Text style={t.strong}>{shot.name}</Text>
          {refused ? <Text style={[t.small, { color: C.text }]}>{refused}</Text>
            : <Text numberOfLines={open ? undefined : 1} style={t.small}>{done ? 'Light and focus look fine.' : shot.guide}</Text>}
        </View>
        {done ? <CheckRing done size={24} /> : !open ? <Icon name="right" size={16} color={C.faint} /> : null}
      </View>
      {open ? (
        <View style={[u.row, { gap: SP[8] }]}>
          <Button label={done ? 'Choose another' : refused ? 'Choose again' : 'Choose photo'} kind={done ? 'soft' : 'accent'} busy={busy} onPress={onChoose} wrap={u.flex} />
          {done ? <Button label="Remove" kind="quiet" onPress={onRemove} /> : null}
        </View>
      ) : null}
    </Card>
  );
}
