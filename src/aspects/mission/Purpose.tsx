import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Block, Button, Chip, dayOf, Failed, Field, Group, haptic, Icon, IconButton, Item, Lead, Skeleton, t, undoable, useAspect } from '@/aspects/kit';
import { call, useCollection } from '@/lib/mod';
import { C } from '@/theme';
import { cap, M, message, refresh, when } from './data';
import { Dot } from './parts';
import type { Direction, Purpose as PurposeDoc } from './types';

const FAMS = [{ key: 'work', label: 'Work' }, { key: 'health', label: 'Health' }, { key: 'people', label: 'People' }] as const;
/** A direction's dot: work in Mission's colour, health in Body's, people in Family's. */
const FAM_ASPECT = { work: 'mission', health: 'body', people: 'family' } as const;
const newest = (a: PurposeDoc, b: PurposeDoc) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));

/** Purpose: the line he lives by, rewritten or drafted from his goals, its earlier versions, and the lifetime directions. */
export function PurposeTab() {
  const a = useAspect();
  const purpose = useCollection<PurposeDoc>('mission', 'purpose');
  const life = useCollection<Direction>('mission', 'life');
  const [edit, setEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; why: string } | null>(null);
  const [busy, setBusy] = useState<'save' | 'draft' | 'dir' | null>(null);
  const [dir, setDir] = useState('');
  const [fam, setFam] = useState<Direction['fam']>('work');

  const versions = (purpose.items ?? []).filter((p) => !p.deleted_at).sort(newest);
  const cur = versions[0] ?? null;
  const dirs = (life.items ?? []).filter((d) => !d.deleted_at).sort((x, y) => (x.position ?? 0) - (y.position ?? 0));
  const save = async (text: string, by: 'me' | 'agent' = 'me') => {
    if (!text.trim()) return;
    setBusy('save');
    try { await purpose.put({ text: text.trim(), by }); haptic.success(); setEdit(null); setDraft(null); refresh(); } catch (e) { a.notice(message(e)); } finally { setBusy(null); }
  };
  const ask = async () => {
    setBusy('draft');
    try { setDraft(await call<{ text: string; why: string }>(`${M}/draft`, { kind: 'purpose' })); } catch (e) { a.notice(message(e)); } finally { setBusy(null); }
  };
  const addDir = async () => {
    const title = dir.trim();
    if (!title || busy) return;
    setBusy('dir');
    try {
      await life.put({ title, fam, position: dirs.length ? Math.max(...dirs.map((d) => d.position ?? 0)) + 1 : 0 });
      setDir(''); haptic.light(); refresh();
    } catch (e) { a.notice(message(e)); } finally { setBusy(null); }
  };
  const removeDir = (d: Direction) => {
    void life.remove(d.id).then(() => {
      refresh(); haptic.light();
      // put back as a fresh record with the same words and place
      undoable(`Removed: ${d.title}`, () => life.put({ title: d.title, fam: d.fam, position: d.position }).then(refresh).catch((e) => a.notice(message(e))));
    }).catch((e) => a.notice(message(e)));
  };

  let lead;
  if (purpose.items == null) {
    lead = purpose.error ? <Failed message={purpose.error} onRetry={purpose.refresh} /> : <Skeleton height={200} radius={28} />;
  } else if (edit != null) {
    lead = (
      <Lead>
        <Text style={[t.footnote, { color: a.color }]}>{cur ? 'Rewrite the line' : 'The line you live by'}</Text>
        <Field value={edit} onChangeText={setEdit} multiline autoFocus maxLength={300} placeholder="One sentence, in your words" />
        <View style={st.buttons}>
          <Button label="Save" kind="accent" onPress={() => void save(edit)} busy={busy === 'save'} disabled={!edit.trim()} wrap={st.flex} />
          <Button label="Cancel" kind="quiet" onPress={() => setEdit(null)} />
        </View>
      </Lead>
    );
  } else if (cur) {
    lead = (
      <Lead>
        <View style={st.gap8}>
          <Text style={[t.footnote, { color: a.color }]}>The line you live by</Text>
          <Text style={t.title3}>{cur.text}</Text>
          <Text style={t.footnote}>{`${cur.created_at ? `Written ${when(dayOf(cur.created_at))}` : 'Written by you'}${cur.by === 'agent' ? ', from a draft' : ''}`}</Text>
        </View>
        <View style={st.buttons}>
          <Button label="Rewrite" kind="soft" onPress={() => setEdit(cur.text)} icon={<Icon name="pencil" size={16} />} wrap={st.flex} />
          <Button label="Draft with Nora" kind="quiet" onPress={() => void ask()} busy={busy === 'draft'} />
        </View>
      </Lead>
    );
  } else {
    lead = (
      <Lead>
        <View style={st.gap4}>
          <Text style={t.title3}>The line you live by</Text>
          <Text style={t.subhead}>One sentence, in your words. It sits above every goal, and each one answers to it.</Text>
        </View>
        <View style={st.buttons}>
          <Button label="Write it" kind="accent" onPress={() => setEdit('')} icon={<Icon name="pencil" size={16} color="#14161C" />} wrap={st.flex} />
          <Button label="Draft with Nora" kind="quiet" onPress={() => void ask()} busy={busy === 'draft'} />
        </View>
      </Lead>
    );
  }

  return (
    <>
      {lead}
      {draft ? (
        <Block title="A draft from your goals">
          <Group pad tone={a.color}>
            <Text style={t.headline}>{draft.text}</Text>
            {draft.why ? <Text style={t.footnote}>{draft.why}</Text> : null}
            <View style={st.buttons}>
              <Button label="Use it" kind="accent" small onPress={() => void save(draft.text, 'agent')} busy={busy === 'save'} />
              <Button label="Edit it first" kind="quiet" small onPress={() => { setEdit(draft.text); setDraft(null); }} />
              <Button label="Keep mine" kind="quiet" small onPress={() => setDraft(null)} />
            </View>
          </Group>
        </Block>
      ) : null}

      <Block title="Lifetime directions" sub="A few lines that hold for life. Year and quarter goals point at them.">
        {life.items == null ? (life.error ? <Failed message={life.error} onRetry={life.refresh} /> : <Skeleton height={120} radius={22} />) : (
          <>
            {dirs.length ? (
              <Group inset={36}>
                {dirs.map((d) => (
                  <Item key={d.id} title={d.title} sub={FAMS.find((f) => f.key === d.fam)?.label} left={<Dot aspect={FAM_ASPECT[d.fam]} />}
                    action={<IconButton label={`Remove ${d.title}`} size={36} plain onPress={() => removeDir(d)}><Icon name="trash" size={16} color={C.faint} /></IconButton>} />
                ))}
              </Group>
            ) : null}
            <Group pad>
              <Field label={dirs.length ? 'Add a direction' : 'Your first direction'} value={dir} onChangeText={setDir} placeholder="A line that holds for life" maxLength={200} onSubmit={() => void addDir()} />
              {dir.trim() ? (
                <>
                  <View style={st.chips}>{FAMS.map((f) => <Chip key={f.key} label={f.label} icon={<Dot aspect={FAM_ASPECT[f.key]} />} selected={fam === f.key} onPress={() => setFam(f.key)} />)}</View>
                  <Button label="Add direction" kind="soft" small busy={busy === 'dir'} onPress={() => void addDir()} wrap={st.left} />
                </>
              ) : null}
            </Group>
          </>
        )}
      </Block>

      {versions.length > 1 ? (
        <Block title="Earlier versions">
          <Group>
            {versions.slice(1, 6).map((v) => <Item key={v.id} title={v.text} lines={3} sub={v.created_at ? cap(when(dayOf(v.created_at))) : null} />)}
          </Group>
        </Block>
      ) : null}
    </>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  left: { alignSelf: 'flex-start' },
});
