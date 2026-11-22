import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F } from '@/theme';
import { ApiError } from '@/lib/mod';
import {
  ago, Button, CheckRing, Chip, Empty, Failed, Field, haptic, Loading, Press, R, rupees, Screen, Sheet, shortDay, Skeleton, SP, SURF, t, useAspect,
} from '@/aspects/kit';
import { act, fileImport, readFile, readPasted, refresh, uploadFile, useImport, useStatementFiles } from './data';
import type { Decision, Home, Import, Row as StRow } from './types';
import { CategorySheet, ChipWrap, Group, Head, s as ui } from './ui';

type Busy = { label: string } | null;
const safeName = (n: string) => {
  const raw = n.replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').trim().slice(0, 80) || 'statement';
  return raw.replace(/^\.+/, '');
};

/**
 * A bank statement, once a month: the realistic way spending gets complete. Start from a file on the PC (Downloads or
 * Money's inbox), pasted text, or (web build) a file picked here. The PC reads it and sorts the rows; he reviews the
 * ones only he can answer and files them in one go.
 */
export function StatementScreen({ open, onClose, home, id, setId }: {
  open: boolean; onClose: () => void; home: Home; id: string | null; setId: (id: string | null) => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null); // a file id whose PDF needs its password
  const run = async (p: Promise<{ item: Import }>, file?: string) => {
    setError(null);
    setBusy({ label: 'Reading the statement on your PC. If its layout is new to the PC this can take a minute; you can leave and come back.' });
    try {
      const r = await p;
      haptic.medium();
      refresh(['imports']);
      setId(r.item.id);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 422 && file) setLocked(file);
      else setError(err.message);
    } finally {
      setBusy(null);
    }
  };
  const close = () => { onClose(); setTimeout(() => { setId(null); setError(null); }, 450); };
  return (
    <Screen open={open} onClose={id ? () => setId(null) : close} title="Bank statement">
      {busy ? <Loading label={busy.label} />
        : id ? <Review id={id} home={home} onDone={close} />
          : <Start home={home} open={open} error={error} onRead={(f) => void run(readFile(f), f)} onPaste={(text) => void run(readPasted(text))}
              onUpload={(file) => void run(uploadFile(file), `inbox:${safeName(file.name ?? 'statement')}`)} onOpen={(x) => setId(x)} />}
      <PasswordSheet file={locked} onClose={() => setLocked(null)} onSubmit={(pw) => { const f = locked!; setLocked(null); void run(readFile(f, pw), f); }} />
    </Screen>
  );
}

function Start({ home, open, error, onRead, onPaste, onUpload, onOpen }: {
  home: Home; open: boolean; error: string | null; onRead: (id: string) => void; onPaste: (text: string) => void;
  onUpload: (file: Blob & { name?: string }) => void; onOpen: (id: string) => void;
}) {
  const files = useStatementFiles(open);
  const [text, setText] = useState('');
  const pick = () => {
    const doc = (globalThis as { document?: { createElement: (t: string) => any } }).document;
    if (!doc) return;
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.csv,.txt,application/pdf,text/csv,text/plain';
    input.onchange = () => { const f = input.files?.[0]; if (f) onUpload(f); };
    input.click();
  };
  const waiting = home.spend.imports.review;
  return (
    <>
      <Text style={t.body}>Download last month&apos;s statement from your bank&apos;s website on the PC, as a PDF or CSV. It shows up here. Rows you already logged are matched, so nothing is counted twice.</Text>
      {error ? <View style={s.error}><Text style={[t.small, { color: C.textSoft }]}>{error}</Text></View> : null}
      {waiting.length ? (
        <View style={s.part}>
          <Head title="Waiting for you" />
          <Group>
            {waiting.map((i) => (
              <Press key={i.id} label={`Review ${i.bank ?? 'statement'}`} onPress={() => onOpen(i.id)} style={s.fileRow}>
                <View style={ui.fill}>
                  <Text style={t.strong} numberOfLines={1}>{i.bank ?? i.name ?? 'Statement'}</Text>
                  <Text style={t.small}>{i.period ? `${shortDay(i.period.from)} to ${shortDay(i.period.to)}` : `Read ${ago(i.at)}`}</Text>
                </View>
                <Text style={t.label}>Review</Text>
              </Press>
            ))}
          </Group>
        </View>
      ) : null}
      <View style={s.part}>
        <Head title="On this PC" action="Look again" onAction={() => void files.refresh()} />
        {files.data ? (files.data.files.length ? (
          <Group>
            {files.data.files.map((f) => (
              <Press key={f.id} label={`Read ${f.name}`} onPress={() => onRead(f.id)} style={s.fileRow}>
                <View style={ui.fill}>
                  <Text style={t.strong} numberOfLines={1}>{f.name}</Text>
                  <Text style={t.small}>{f.where === 'downloads' ? 'Downloads' : 'Sent from the phone'}, {ago(f.at)}</Text>
                </View>
                <Text style={t.label}>Read</Text>
              </Press>
            ))}
          </Group>
        ) : <Text style={t.small}>No statement in Downloads from the last 90 days. A file whose name says statement, account or your bank shows here.</Text>)
          : files.error ? <Failed message={files.error} onRetry={() => void files.refresh()} />
            : <Skeleton height={64} radius={R.card} />}
      </View>
      {Platform.OS === 'web' ? (
        <View style={s.part}>
          <Head title="From this computer" />
          <Button label="Choose a file" kind="quiet" onPress={pick} />
        </View>
      ) : null}
      <View style={s.part}>
        <Head title="Or paste it" />
        <Field value={text} onChangeText={setText} placeholder="The statement's text or CSV" multiline />
        <Button label="Read it" kind="quiet" onPress={() => onPaste(text)} disabled={text.trim().length < 20} />
      </View>
    </>
  );
}

const DEFAULT: Record<StRow['status'], Decision['action']> = { new: 'add', income: 'income', sub: 'bill', ask: 'skip', matched: 'skip', moved: 'skip' };

function Review({ id, home, onDone }: { id: string; home: Home; onDone: () => void }) {
  const a = useAspect();
  const imp = useImport(id);
  const [dec, setDec] = useState<Record<string, Decision>>({});
  const [chosen, setAccount] = useState<string | null | undefined>(undefined);
  const [picking, setPicking] = useState<StRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [filed, setFiled] = useState<Import['filed'] | null>(null);
  const item = imp.data?.item ?? null;
  if (!item) return imp.error ? <Failed message={imp.error} onRetry={() => void imp.refresh()} /> : <><Skeleton height={48} radius={R.row} /><Skeleton height={220} radius={R.card} /></>;
  const account = chosen === undefined ? item.account ?? null : chosen;
  const done = filed ?? (item.status === 'filed' ? item.filed : null);
  if (done) {
    return (
      <View style={s.part}>
        <Text style={t.title2}>Filed</Text>
        <Text style={t.body}>{done.n === 1 ? 'One row' : `${done.n} rows`} went into Money: {rupees(done.out)} out{done.in ? `, ${rupees(done.in)} in` : ''}{done.bills ? `, ${done.bills === 1 ? 'one subscription' : `${done.bills} subscriptions`} added` : ''}.</Text>
        <Button label="Done" onPress={onDone} />
      </View>
    );
  }
  const rows = item.rows ?? [];
  const get = (r: StRow): Decision => dec[r.id] ?? { action: DEFAULT[r.status], category: r.category ?? undefined };
  const set = (r: StRow, d: Partial<Decision>) => setDec((m) => ({ ...m, [r.id]: { ...get(r), ...d } }));
  const by = (st: StRow['status']) => rows.filter((r) => r.status === st);
  const fileable = rows.filter((r) => !['matched', 'moved'].includes(r.status) && get(r).action !== 'skip');
  const outSum = fileable.filter((r) => r.dir === 'dr').reduce((n, r) => n + r.amount, 0);
  const inSum = fileable.filter((r) => r.dir === 'cr').reduce((n, r) => n + r.amount, 0);
  const cats = home.spend.cats;
  const catName = (c?: string | null) => cats.find((x) => x.id === c)?.name ?? (c === 'bills' ? 'Bills' : 'Pick one');
  const file = async () => {
    setBusy(true);
    const decisions = Object.fromEntries(rows.map((r) => [r.id, get(r)]));
    const r = await act(fileImport(item.id, decisions, account), a.notice, "Couldn't file it");
    setBusy(false);
    if (r) { haptic.success(); setFiled(r.item.filed ?? { n: fileable.length, out: outSum, in: inSum, bills: 0, at: new Date().toISOString() }); }
  };
  const matched = by('matched').length, moved = by('moved').length;
  return (
    <>
      <View style={s.part}>
        <Text style={t.title2}>{item.bank ?? item.name ?? 'Statement'}</Text>
        <Text style={t.small}>
          {item.period ? `${shortDay(item.period.from)} to ${shortDay(item.period.to)}, ` : ''}{rows.length} rows.{matched ? ` ${matched} already in Money.` : ''}{moved ? ` ${moved} moved between your own accounts.` : ''}
        </Text>
      </View>
      {by('new').length ? (
        <Part title="New spends" hint="Tap the category to change it.">
          {by('new').map((r) => (
            <ReviewRow key={r.id} r={r} on={get(r).action !== 'skip'} onToggle={() => set(r, { action: get(r).action === 'skip' ? 'add' : 'skip' })}>
              <Chip label={catName(get(r).category)} selected={get(r).action !== 'skip'} onPress={() => setPicking(r)} />
            </ReviewRow>
          ))}
        </Part>
      ) : null}
      {by('ask').length ? (
        <Part title="Only you know" hint="Payments to a person. Say what each one was.">
          {by('ask').map((r) => (
            <ReviewRow key={r.id} r={r}>
              <ChipWrap>
                {(['add', 'loan', 'gift', 'skip'] as const).map((k) => (
                  <Chip key={k} label={{ add: 'A spend', loan: 'A loan', gift: 'A gift', skip: 'Skip' }[k]} selected={get(r).action === k} onPress={() => set(r, { action: k, category: k === 'add' ? 'other' : undefined })} />
                ))}
              </ChipWrap>
            </ReviewRow>
          ))}
        </Part>
      ) : null}
      {by('sub').length ? (
        <Part title="Subscriptions found" hint="Filed as a bill, it joins your monthly total.">
          {by('sub').map((r) => (
            <ReviewRow key={r.id} r={r}>
              <ChipWrap>
                {(['bill', 'add', 'skip'] as const).map((k) => (
                  <Chip key={k} label={{ bill: 'A subscription', add: 'A one time spend', skip: 'Skip' }[k]} selected={get(r).action === k} onPress={() => set(r, { action: k })} />
                ))}
              </ChipWrap>
            </ReviewRow>
          ))}
        </Part>
      ) : null}
      {by('income').length ? (
        <Part title="Money in" hint="Where each came from decides if it counts as earned.">
          {by('income').map((r) => (
            <ReviewRow key={r.id} r={r} on={get(r).action !== 'skip'} onToggle={() => set(r, { action: get(r).action === 'skip' ? 'income' : 'skip' })}>
              <ChipWrap>
                {home.earn.choices.map((c) => (
                  <Chip key={c.id} label={c.name} selected={get(r).action !== 'skip' && (get(r).category ?? 'otherin') === c.id} onPress={() => set(r, { action: 'income', category: c.id })} />
                ))}
              </ChipWrap>
            </ReviewRow>
          ))}
        </Part>
      ) : null}
      {home.save.accounts.filter((x) => !x.liability).length ? (
        <View style={s.part}>
          <Head title="Whose statement is it" />
          <Text style={t.small}>Its closing balance becomes that account&apos;s balance, dated the statement&apos;s last day.</Text>
          <ChipWrap>
            <Chip label="Don't set a balance" selected={account == null} onPress={() => setAccount(null)} />
            {home.save.accounts.filter((x) => !x.liability).map((x) => <Chip key={x.id} label={x.name} selected={account === x.id} onPress={() => setAccount(x.id)} />)}
          </ChipWrap>
        </View>
      ) : null}
      {fileable.length ? (
        <Button label={`File ${fileable.length === 1 ? 'one row' : `${fileable.length} rows`}`} onPress={() => void file()} busy={busy} />
      ) : <Empty title="Nothing new in this one" body="Every row is already in Money or skipped." action="Done" onAction={onDone} />}
      {fileable.length ? <Text style={[t.small, s.centre]}>{rupees(outSum)} out{inSum ? `, ${rupees(inSum)} in` : ''}</Text> : null}
      <CategorySheet open={!!picking} onClose={() => setPicking(null)} cats={cats} value={picking ? get(picking).category ?? null : null}
        onPick={(c) => { if (picking) set(picking, { action: 'add', category: c }); }} />
    </>
  );
}

function Part({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <View style={s.part}>
      <Head title={title} />
      <Text style={t.small}>{hint}</Text>
      <Group>{children}</Group>
    </View>
  );
}

/** One statement row: include it or not (when that is the choice), what it was, and the control that decides. */
function ReviewRow({ r, on, onToggle, children }: { r: StRow; on?: boolean; onToggle?: () => void; children: React.ReactNode }) {
  const body = (
    <>
      {onToggle ? <CheckRing done={!!on} /> : null}
      <View style={ui.fill}>
        <Text style={[t.strong, on === false && { color: C.faint }]} numberOfLines={1}>{r.merchant}</Text>
        <Text style={t.small} numberOfLines={2}>{shortDay(r.date)}{r.why ? `, ${r.why.charAt(0).toLowerCase()}${r.why.slice(1)}` : ''}</Text>
      </View>
      <Text style={[t.label, t.num, on === false && { color: C.faint }]}>{r.dir === 'cr' ? '+' : ''}{rupees(r.amount)}</Text>
    </>
  );
  return (
    <View style={s.rrow}>
      {onToggle ? (
        <Press label={`${on ? 'Leave out' : 'Include'} ${r.merchant}, ${rupees(r.amount)}`} role="checkbox" state={{ checked: !!on }} onPress={onToggle} scale={0.99} style={s.rtop}>{body}</Press>
      ) : <View style={s.rtop}>{body}</View>}
      <View style={onToggle ? s.rctl : undefined}>{children}</View>
    </View>
  );
}

function PasswordSheet({ file, onClose, onSubmit }: { file: string | null; onClose: () => void; onSubmit: (pw: string) => void }) {
  const a = useAspect();
  const [pw, setPw] = useState('');
  return (
    <Sheet open={!!file} onClose={() => { setPw(''); onClose(); }} title="This PDF has a password">
      <Text style={t.small}>Banks usually use your customer ID or date of birth. It goes to your PC to open the file and is not kept.</Text>
      <TextInput accessibilityLabel="Statement password" value={pw} onChangeText={setPw} secureTextEntry autoFocus={!!file} autoCapitalize="none" autoCorrect={false}
        keyboardAppearance="dark" selectionColor={a.color} placeholder="Password" placeholderTextColor={C.faint} style={s.pw} onSubmitEditing={() => pw && onSubmit(pw)} />
      <Button label="Open it" onPress={() => { const v = pw; setPw(''); onSubmit(v); }} disabled={!pw} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  part: { gap: SP[12] },
  error: { padding: SP[12], borderRadius: R.row, backgroundColor: 'rgba(248,113,113,0.12)' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: SP[12], minHeight: 56, paddingVertical: SP[8] },
  rrow: { paddingVertical: SP[12], gap: SP[8] },
  rtop: { flexDirection: 'row', alignItems: 'center', gap: SP[12], minHeight: 44 },
  rctl: { paddingLeft: SP[24] + SP[12] },
  centre: { textAlign: 'center' },
  pw: {
    minWidth: 0, minHeight: 48, borderRadius: R.row, paddingHorizontal: SP[16], backgroundColor: SURF.card, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line,
    fontFamily: F.regular, fontSize: 16, color: C.text, outlineWidth: 0,
  },
});
