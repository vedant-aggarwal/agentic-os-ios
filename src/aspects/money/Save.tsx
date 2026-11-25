import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGet } from '@/lib/mod';
import {
  Bar, Block, Button, Chip, Field, Group, haptic, Icon, IconButton, Item, Metric, Metrics, myDay, rupees, Sheet, shortDay, t, Tag, undoable, useAspect,
} from '@/aspects/kit';
import { act, amountOf, useAccounts, useFunds, useTx } from './data';
import { useNav } from './nav';
import { AmountSheet } from './pad';
import type { Account, Home, Jar } from './types';
import { AmountInput, ChipRow, ChipWrap, s as u } from './ui';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym: string) => `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const addMonths = (ym: string, n: number) => { const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const endOf = (ym: string) => `${ym}-${String(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;
const KINDS = [
  { key: 'bank', label: 'Bank account' }, { key: 'cash', label: 'Cash' }, { key: 'upi', label: 'UPI or wallet' },
  { key: 'invest', label: 'Savings and investments' }, { key: 'card', label: 'Credit card' }, { key: 'loan', label: 'Loan' }, { key: 'owed', label: 'Someone owes me' },
] as const;
const kindLabel = (k: string) => KINDS.find((x) => x.key === k)?.label ?? 'Account';
const age = (a: Account) => (a.ageDays == null ? 'No date' : a.ageDays === 0 ? 'Today' : a.ageDays === 1 ? 'Yesterday' : a.ageDays < 31 ? `${a.ageDays} days ago` : `On ${shortDay(a.asOf!)}`);
type Goal = { id: string; title: string; status: string; horizon: string };

/** What one tap puts in: what this month still needs, else the last amount, else the planned pace. Rounded up to a hundred. */
export function putInAmount(j: Jar) {
  const v = j.dueThisMonth && j.dueThisMonth > 0 ? j.dueThisMonth : j.last ?? j.need ?? null;
  if (!v || v <= 0) return null;
  return v > 100 ? Math.ceil(v / 100) * 100 : Math.round(v);
}

function paceText(j: Jar) {
  if (j.done) return `Reached, ${rupees(j.saved)} in it.`;
  if (j.late) return `Its date has passed. ${rupees(j.left ?? 0)} to go.`;
  const thisMonth = j.month > 0
    ? (j.dueThisMonth ? `${rupees(j.month)} in this month, ${rupees(j.dueThisMonth)} more to keep pace.` : `${rupees(j.month)} in this month.`)
    : 'Nothing in yet this month.';
  if (j.need != null && j.due) return j.onTrack ? `On pace for ${monthLabel(j.due.slice(0, 7))}. ${thisMonth}` : `Needs ${rupees(j.need)} a month to reach it by ${monthLabel(j.due.slice(0, 7))}. ${thisMonth}`;
  if (j.need != null) return `You planned ${rupees(j.need)} a month. ${thisMonth}`;
  return j.target ? `${rupees(j.left ?? 0)} to go. Give it a date to see the pace.` : `${rupees(j.saved)} in it so far.`;
}

/** Quick amounts for a jar: what this month needs, the last put in, what would finish it. Each once. */
function presetsFor(j: Jar) {
  const out: { label: string; amount: number }[] = [];
  const add = (amount: number | null | undefined, label: (v: string) => string) => {
    if (!amount || amount <= 0 || out.some((p) => p.amount === Math.round(amount))) return;
    out.push({ label: label(rupees(Math.round(amount))), amount: Math.round(amount) });
  };
  add(j.dueThisMonth, (v) => `${v} this month`);
  add(j.last, (v) => `${v} like last time`);
  add(j.left, (v) => `${v} to finish`);
  return out;
}

/** Save: a jar for each thing he is saving for (one tap puts this month's share in), and what he has. */
export function SaveTab({ home }: { home: Home }) {
  const a = useAspect();
  const nav = useNav();
  const tx = useTx();
  const goals = useGet<{ goals: Goal[] }>(a.open && nav.tab === 'save' ? '/goals' : null);
  const [putting, setPutting] = useState<Jar | null>(null);
  const [editing, setEditing] = useState<Jar | null>(null);
  const [acct, setAcct] = useState<Account | 'new' | null>(null);
  const { save } = home;
  const goalTitle = (id: string | null) => (id ? goals.data?.goals.find((g) => g.id === id)?.title ?? null : null);
  const putIn = async (j: Jar, amount: number) => {
    const r = await act(tx.put({ kind: 'move', amount, fund: j.id, merchant: j.name, at: new Date().toISOString(), source: 'app' }), a.notice);
    if (r) { haptic.success(); undoable(`Put ${rupees(amount)} in ${j.name}`, () => void act(tx.remove(r.id), a.notice, "Couldn't undo that")); }
  };
  const net = save.net != null && save.net < 0 ? `${rupees(-save.net)} owed` : rupees(save.net ?? 0);
  return (
    <>
      {save.jars.length ? (
        <Group pad>
          <Metrics>
            <Metric size="m" label="Put aside" value={rupees(save.total.saved)} sub={save.total.target ? `of ${rupees(save.total.target)}` : null} />
            <Metric size="m" label={`In ${home.month.name}`} value={rupees(save.total.month)} sub={save.total.month > 0 ? 'put in this month' : 'nothing in yet'} />
          </Metrics>
        </Group>
      ) : null}

      <Block title="Jars" action={save.jars.length ? 'New jar' : undefined} onAction={() => nav.openSheet({ kind: 'jar' })}
        sub={save.jars.length ? 'One tap puts in what this month needs. It only records; no money moves.' : null}>
        {save.jars.length ? save.jars.map((j) => {
          const one = putInAmount(j);
          const goal = goalTitle(j.goal);
          return (
            <Group key={j.id} pad>
              <View style={u.between}>
                <Text style={[t.headline, u.fill]} numberOfLines={1}>{j.name}</Text>
                {j.done ? <Tag label="Reached" tone="aspect" /> : null}
                <IconButton label={`Change ${j.name}`} size={36} plain onPress={() => setEditing(j)}><Icon name="more" size={18} /></IconButton>
              </View>
              <View style={s.amountLine}>
                <Text style={[t.title3, t.num]}>{rupees(j.saved)}</Text>
                {j.target ? <Text style={[t.subhead, t.num]}>{`of ${rupees(j.target)}`}</Text> : null}
              </View>
              {j.pct != null ? <Bar progress={j.pct} height={6} /> : null}
              <Text style={[t.footnote, t.num]}>{paceText(j)}</Text>
              {goal ? <Text style={t.footnote} numberOfLines={1}>{`For the goal: ${goal}`}</Text> : null}
              {!j.done ? (
                <View style={s.actions}>
                  {one ? <Button label={`Put in ${rupees(one)}`} kind="soft" small onPress={() => void putIn(j, one)} /> : null}
                  <Button label={one ? 'Other amount' : 'Put in'} kind="quiet" small onPress={() => setPutting(j)} />
                </View>
              ) : null}
            </Group>
          );
        }) : (
          <Group pad>
            <Text style={t.callout}>Saving for something?</Text>
            <Text style={t.footnote}>A jar holds what you put aside for one thing, with a target and a date. It shows what each month needs.</Text>
            <View style={s.left}><Button label="Make a jar" kind="soft" small onPress={() => nav.openSheet({ kind: 'jar' })} /></View>
          </Group>
        )}
      </Block>

      <Block title="What I have" action={save.accounts.length ? 'Add' : undefined} onAction={() => setAcct('new')}>
        {save.accounts.length ? (
          <>
            <Group pad>
              <Metric size="l" label="All your balances together" value={net} sub={netNote(home)} />
            </Group>
            <Group>
              {save.accounts.map((x) => (
                <Item key={x.id} title={x.name} sub={`${kindLabel(x.kind)}, ${age(x).toLowerCase()}`} onPress={() => setAcct(x)} chevron
                  right={<Text style={[t.callout, t.num]}>{x.liability ? `owe ${rupees(x.balance)}` : rupees(x.balance)}</Text>}
                  label={`${x.name}, ${x.liability ? `owe ${rupees(x.balance)}` : rupees(x.balance)}, ${age(x).toLowerCase()}. Change`} />
              ))}
            </Group>
          </>
        ) : (
          <Group pad>
            <Text style={t.callout}>What is in your accounts</Text>
            <Text style={t.footnote}>Type a balance and the day it was true. Nothing connects to your bank; this page only records.</Text>
            <View style={s.left}><Button label="Add a balance" kind="soft" small onPress={() => setAcct('new')} /></View>
          </Group>
        )}
      </Block>

      <AmountSheet open={!!putting} onClose={() => setPutting(null)} title={putting ? `Put in ${putting.name}` : 'Put in'}
        sub="This records that you set it aside. No money moves anywhere." presets={putting ? presetsFor(putting) : undefined}
        done="Put in" withAmount onDone={(n) => { const j = putting; setPutting(null); if (j) void putIn(j, n); }} />
      <JarSheet open={!!editing} jar={editing} onClose={() => setEditing(null)} />
      <AccountSheet item={acct} onClose={() => setAcct(null)} />
    </>
  );
}

export function netNote(home: Home) {
  const o = home.save.oldest;
  if (!o) return 'From the balances below';
  if (o.ageDays <= 1) return 'From balances true today';
  return `Last known. The oldest balance is from ${shortDay(o.date)}, ${o.ageDays} days ago.`;
}

/** A new jar, or a change to one: name, target, by when, the Mission goal it serves. */
export function JarSheet({ open, jar, onClose }: { open: boolean; jar: Jar | null; onClose: () => void }) {
  const a = useAspect();
  const funds = useFunds();
  const goals = useGet<{ goals: Goal[] }>(open ? '/goals' : null).data?.goals ?? null;
  const ym = myDay().slice(0, 7);
  const [was, setWas] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [inIt, setInIt] = useState('');
  if (open && !was) {
    setWas(true);
    setName(jar?.name ?? ''); setTarget(jar?.target ? String(jar.target) : ''); setDue(jar?.due ? jar.due.slice(0, 7) : null);
    setGoal(jar?.goal ?? null); setInIt(jar ? String(jar.saved) : '');
  }
  if (!open && was) setWas(false);
  const nTarget = amountOf(target);
  const months = Array.from({ length: 24 }, (_, i) => addMonths(ym, i));
  const live = (goals ?? []).filter((g) => g.status === 'active' && !['day', 'week'].includes(g.horizon));
  const save = async () => {
    const nm = name.trim();
    if (!nm) return;
    onClose();
    const fields = { name: nm.slice(0, 60), target: nTarget, due: due ? endOf(due) : null, goal };
    if (!jar) {
      const r = await act(funds.put({ ...fields, start: 0, monthly: null, aspect: null }), a.notice);
      if (r) { haptic.medium(); a.notice(`Made the jar ${nm}`); }
      return;
    }
    const doc = funds.items?.find((f) => f.id === jar.id);
    const wanted = amountOf(inIt) ?? 0;
    // "in it so far" moves the starting amount, so every put in stays on record
    const start = Math.max(0, (doc?.start ?? 0) + (wanted - jar.saved));
    await act(funds.patch(jar.id, { ...fields, start }), a.notice);
  };
  const remove = async () => {
    if (!jar) return;
    const before = funds.items?.find((f) => f.id === jar.id) ?? null;
    onClose();
    const r = await act(funds.remove(jar.id).then(() => true), a.notice, "Couldn't remove that");
    if (r && before) undoable(`Removed the jar ${jar.name}`, () => void act(funds.put(before), a.notice, "Couldn't undo that"));
  };
  return (
    <Sheet open={open} onClose={onClose} title={jar ? jar.name : 'New jar'}>
      <Field label="Saving for" value={name} onChangeText={setName} placeholder="A laptop, a trip, a cushion" maxLength={60} autoFocus={open && !jar} />
      <Text style={t.footnote}>Target</Text>
      <AmountInput value={target} onChange={setTarget} label="Target in rupees" autoFocus={false} />
      <Text style={t.footnote}>{due ? `By ${monthLabel(due)}` : 'By when'}</Text>
      <ChipRow>
        <Chip label="No date" selected={due == null} onPress={() => setDue(null)} />
        {months.map((m) => <Chip key={m} label={monthLabel(m)} selected={due === m} onPress={() => setDue(m)} />)}
      </ChipRow>
      {live.length ? (
        <>
          <Text style={t.footnote}>For a Mission goal</Text>
          <ChipRow>
            <Chip label="None" selected={goal == null} onPress={() => setGoal(null)} />
            {[...live].sort((x, y) => Number(y.id === jar?.goal) - Number(x.id === jar?.goal)).map((g) => <Chip key={g.id} label={g.title.length > 36 ? `${g.title.slice(0, 35).trim()}…` : g.title} selected={goal === g.id} onPress={() => setGoal(g.id)} />)}
          </ChipRow>
        </>
      ) : null}
      {jar ? <Field label="In it so far, in rupees" value={inIt} onChangeText={(v) => setInIt(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" /> : null}
      <Button label={jar ? 'Save' : 'Make the jar'} onPress={() => void save()} disabled={!name.trim()} />
      {jar ? <Button label="Remove this jar" kind="quiet" onPress={() => void remove()} /> : null}
    </Sheet>
  );
}

/** A balance and the day it was true: a new account, or today's balance for one. */
function AccountSheet({ item, onClose }: { item: Account | 'new' | null; onClose: () => void }) {
  const a = useAspect();
  const accounts = useAccounts();
  const [shown, setShown] = useState<Account | 'new' | null>(item);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('bank');
  const [bal, setBal] = useState('');
  if (item && item !== shown) {
    setShown(item);
    if (item === 'new') { setName(''); setKind('bank'); setBal(''); } else { setName(item.name); setKind(item.kind); setBal(String(item.balance)); }
  }
  const x = item ?? shown;
  const isNew = x === 'new';
  const n = bal === '' ? null : Number(bal.replace(/[^\d]/g, ''));
  const save = async () => {
    if (n == null || !name.trim()) return;
    onClose();
    const as_of = new Date().toISOString();
    if (isNew) await act(accounts.put({ name: name.trim().slice(0, 60), kind, balance: n, as_of, counted: true }), a.notice);
    else if (x) await act(accounts.patch(x.id, { name: name.trim().slice(0, 60), balance: n, as_of }), a.notice);
  };
  const remove = async () => {
    if (!x || x === 'new') return;
    const before = accounts.items?.find((d) => d.id === x.id) ?? null;
    onClose();
    const r = await act(accounts.remove(x.id).then(() => true), a.notice, "Couldn't remove that");
    if (r && before) undoable(`Removed ${x.name}`, () => void act(accounts.put(before), a.notice, "Couldn't undo that"));
  };
  return (
    <Sheet open={!!item} onClose={onClose} title={isNew ? 'Add a balance' : x ? x.name : ''}>
      {isNew ? (
        <>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Savings account" maxLength={60} autoFocus={!!item} />
          <ChipWrap>{KINDS.map((k) => <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />)}</ChipWrap>
        </>
      ) : <Text style={t.subhead}>{typeof x === 'object' && x ? `Last set ${age(x).toLowerCase()}. Type what it holds today.` : ''}</Text>}
      <Text style={t.footnote}>{['card', 'loan'].includes(kind) ? 'What you owe today' : 'Balance today'}</Text>
      <AmountInput value={bal} onChange={setBal} label="Balance in rupees" autoFocus={!!item && !isNew} />
      <Button label="Save" onPress={() => void save()} disabled={n == null || !name.trim()} />
      {!isNew ? <Button label="Remove" kind="quiet" onPress={() => void remove()} /> : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  amountLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  left: { flexDirection: 'row', marginTop: 4 },
});
