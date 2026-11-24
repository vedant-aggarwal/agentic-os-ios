import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chip, dayOf, Empty, Failed, Field, haptic, Icon, IconButton, Row, Screen, Section, shortDay, Skeleton, t, useAspect } from '@/aspects/kit';
import { call, useCollection } from '@/lib/mod';
import { C } from '@/theme';
import { M, message, refresh } from './data';
import { Link } from './parts';
import type { Direction, Purpose as PurposeDoc } from './types';

const FAMS = [{ key: 'work', label: 'Work' }, { key: 'health', label: 'Health' }, { key: 'people', label: 'People' }] as const;
const newest = (a: PurposeDoc, b: PurposeDoc) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));

/** The line he lives by, with its earlier versions, and the few lifetime directions every goal points toward. */
export function Purpose({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const purpose = useCollection<PurposeDoc>('mission', 'purpose');
  const life = useCollection<Direction>('mission', 'life');
  const [edit, setEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; why: string } | null>(null);
  const [busy, setBusy] = useState<'save' | 'draft' | null>(null);
  const [dir, setDir] = useState('');
  const [fam, setFam] = useState<Direction['fam']>('work');

  const versions = (purpose.items ?? []).filter((p) => !p.deleted_at).sort(newest);
  const cur = versions[0] ?? null;
  const save = async (text: string, by: 'me' | 'agent' = 'me') => {
    if (!text.trim()) return;
    setBusy('save');
    try { await purpose.put({ text: text.trim(), by }); haptic.success(); setEdit(null); setDraft(null); refresh(); } catch (e) { a.notice(message(e)); } finally { setBusy(null); }
  };
  const ask = async () => {
    setBusy('draft');
    try { const r = await call<{ text: string; why: string }>(`${M}/draft`, { kind: 'purpose' }); setDraft(r); } catch (e) { a.notice(message(e)); } finally { setBusy(null); }
  };
  const addDir = async () => {
    if (!dir.trim()) return;
    try {
      const dirs = (life.items ?? []).filter((d) => !d.deleted_at);
      await life.put({ title: dir.trim(), fam, position: dirs.length ? Math.max(...dirs.map((d) => d.position ?? 0)) + 1 : 0 });
      setDir(''); haptic.light(); refresh();
    } catch (e) { a.notice(message(e)); }
  };
  const dirs = (life.items ?? []).filter((d) => !d.deleted_at).sort((x, y) => (x.position ?? 0) - (y.position ?? 0));

  return (
    <Screen open={open} onClose={onClose} title="Purpose">
      {purpose.items == null && purpose.error ? <Failed message={purpose.error} onRetry={purpose.refresh} /> : purpose.items == null ? (
        <View style={st.gap}><Skeleton height={120} radius={24} /><Skeleton height={56} /></View>
      ) : edit != null ? (
        <Section title={cur ? 'Rewrite the line' : 'The line you live by'}>
          <Field value={edit} onChangeText={setEdit} multiline autoFocus maxLength={300} placeholder="One sentence, in your words" />
          <Button label="Save" onPress={() => void save(edit)} busy={busy === 'save'} disabled={!edit.trim()} />
          <Button label="Cancel" kind="quiet" onPress={() => setEdit(null)} />
        </Section>
      ) : (
        <>
          {cur ? (
            <Card style={st.card}>
              <Text style={t.heading}>{cur.text}</Text>
              <Text style={t.caption}>{cur.created_at ? `Written ${shortDay(dayOf(cur.created_at))}` : 'Written by you'}{cur.by === 'agent' ? ', from a draft' : ''}</Text>
              <View style={st.buttons}>
                <Button label="Rewrite" kind="quiet" small onPress={() => setEdit(cur.text)} />
                <Button label="Draft one with Nora" kind="soft" small onPress={() => void ask()} busy={busy === 'draft'} />
              </View>
            </Card>
          ) : (
            <Card>
              <Empty title="The line you live by" body="One sentence, in your words. It sits at the top of Mission and every goal answers to it."
                action="Write it" onAction={() => setEdit('')} />
              <Button label="Draft one with Nora" kind="quiet" small onPress={() => void ask()} busy={busy === 'draft'} wrap={st.centre} />
            </Card>
          )}
          {draft ? (
            <Card tone={a.color} style={st.card}>
              <Text style={t.label}>A draft from your goals</Text>
              <Text style={t.lead}>{draft.text}</Text>
              {draft.why ? <Text style={t.small}>{draft.why}</Text> : null}
              <View style={st.buttons}>
                <Button label="Use it" kind="soft" small onPress={() => void save(draft.text, 'agent')} busy={busy === 'save'} />
                <Button label="Edit it first" kind="quiet" small onPress={() => { setEdit(draft.text); setDraft(null); }} />
                <Button label="Keep mine" kind="quiet" small onPress={() => setDraft(null)} />
              </View>
            </Card>
          ) : null}
          {versions.length > 1 ? (
            <Section title="Earlier versions">
              {versions.slice(1, 6).map((v) => <Row key={v.id} title={v.text} sub={v.created_at ? shortDay(dayOf(v.created_at)) : null} />)}
            </Section>
          ) : null}
        </>
      )}

      <Section title="Lifetime directions">
        <Text style={t.small}>A few lines that hold for life. Year and quarter goals point at them.</Text>
        {life.items == null ? (life.error ? <Link label="Directions did not load. Try again" onPress={life.refresh} /> : <Skeleton height={56} />) : dirs.map((d) => (
          <Row key={d.id} title={d.title} sub={FAMS.find((f) => f.key === d.fam)?.label}
            right={<IconButton label={`Remove ${d.title}`} size={36} plain onPress={() => { void life.remove(d.id).then(refresh).catch((e) => a.notice(message(e))); }}><Icon name="trash" size={16} color={C.faint} /></IconButton>} />
        ))}
        {life.items == null ? null : <Field value={dir} onChangeText={setDir} placeholder={dirs.length ? 'Add a direction' : 'Your first direction'} maxLength={200} onSubmit={() => void addDir()} />}
        {life.items != null && dir.trim() ? (
          <>
            <View style={st.chips}>{FAMS.map((f) => <Chip key={f.key} label={f.label} selected={fam === f.key} onPress={() => setFam(f.key)} />)}</View>
            <Button label="Add direction" kind="soft" small onPress={() => void addDir()} wrap={st.left} />
          </>
        ) : null}
      </Section>
    </Screen>
  );
}

const st = StyleSheet.create({
  gap: { gap: 16 },
  card: { gap: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  left: { alignSelf: 'flex-start' },
  centre: { alignSelf: 'center', marginBottom: 8 },
});
