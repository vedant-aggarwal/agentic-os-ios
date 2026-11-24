import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGet } from '@/lib/mod';
import {
  Bar, Button, Chip, Empty, Field, haptic, Icon, IconButton, myDay, Row, rupees, Screen, Sheet, shortDay, SP, t, undoable, useAspect,
} from '@/aspects/kit';
import { act, amountOf, useAccounts, useFunds, useTx } from './data';
import type { Account, Home, Jar } from './types';
import { AmountInput, ChipRow, Group, Head, s as ui } from './ui';

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

/** A jar on the home screen: its name, how far along, the amount. */
export function JarMini({ jar }: { jar: Jar }) {
  return (
    <View style={s.mini} accessible accessibilityLabel={`${jar.name}, ${rupees(jar.saved)}${jar.target ? ` of ${rupees(jar.target)}` : ''}`}>
      <View style={s.row}>
        <Text style={t.strong} numberOfLines={1}>{jar.name}</Text>
        <View style={ui.fill} />
        <Text style={[t.label, t.num]}>{rupees(jar.saved)}{jar.target ? ` of ${rupees(jar.target)}` : ''}</Text>
      </View>
      {jar.pct != null ? <Bar progress={jar.pct} height={6} /> : null}
    </View>
  );
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

/** Save: a jar for each thing he is saving for, and what he has (balances with the day each was true). */
export function SaveScreen({ open, onClose, home, onNewJar }: { open: boolean; onClose: () => void; home: Home; onNewJar: () => void }) {
  const a = useAspect();
  const tx = useTx();
  const goals = useGet<{ goals: Goal[] }>(open ? '/goals' : null);
  const [putting, setPutting] = useState<Jar | null>(null);
  const [editing, setEditing] = useState<Jar | null>(null);
  const [acct, setAcct] = useState<Account | 'new' | null>(null);
  const { save } = home;
  const goalTitle = (id: string | null) => (id ? goals.data?.goals.find((g) => g.id === id)?.title ?? null : null);
  const putIn = async (j: Jar, amount: number) => {
    const r = await act(tx.put({ kind: 'move', amount, fund: j.id, merchant: j.name, at: new Date().toISOString(), source: 'app' }), a.notice);
    if (r) { haptic.success(); undoable(`Put ${rupees(amount)} in ${j.name}`, () => void act(tx.remove(r.id), a.notice, "Couldn't undo that")); }
  };
  return (
    <Screen open={open} onClose={onClose} title="Save">
      <View style={s.part}>
        <Head title="Jars" right={save.jars.length ? `${rupees(save.total.saved)} put aside` : null} action={save.jars.length ? 'New jar' : undefined} onAction={onNewJar} />
        {save.jars.length ? (
          <Group>
            {save.jars.map((j) => {
              const one = putInAmount(j);
              const goal = goalTitle(j.goal);
              return (
                <View key={j.id} style={s.jar}>
                  <View style={s.row}>
                    <Text style={t.lead} numberOfLines={1}>{j.name}</Text>
                    <View style={ui.fill} />
                    <IconButton label={`Change ${j.name}`} size={36} plain onPress={() => setEditing(j)}><Icon name="more" size={18} /></IconButton>
                  </View>
                  <View style={s.row}>
                    <Text style={[t.title2, t.num]}>{rupees(j.saved)}</Text>
                    {j.target ? <Text style={[t.label, t.num]}>of {rupees(j.target)}</Text> : null}
                  </View>
                  {j.pct != null ? <Bar progress={j.pct} /> : null}
                  <Text style={t.small}>{paceText(j)}</Text>
                  {goal ? <Text style={t.caption} numberOfLines={1}>For the goal: {goal}</Text> : null}
                  {!j.done ? (
                    <View style={s.actions}>
                      {one ? <Button label={`Put in ${rupees(one)}`} kind="soft" small onPress={() => void putIn(j, one)} /> : null}
                      <Button label={one ? 'Other amount' : 'Put in'} kind="quiet" small onPress={() => setPutting(j)} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Group>
        ) : <Empty title="Saving for something?" body="A jar holds what you put aside for one thing, with a target and a date. It shows what each month needs." action="Make a jar" onAction={onNewJar} />}
      </View>

      <View style={s.part}>
        <Head title="What I have" action={save.accounts.length ? 'Add' : undefined} onAction={() => setAcct('new')} />
        {save.accounts.length ? (
          <>
            <View style={s.net}>
              <Text style={[t.title2, t.num]}>{save.net != null && save.net < 0 ? `${rupees(-save.net)} owed` : rupees(save.net ?? 0)}</Text>
              <Text style={t.small}>{netNote(home)}</Text>
            </View>
            <Group>
              {save.accounts.map((x) => (
                <Row key={x.id} title={x.name} sub={`${kindLabel(x.kind)}, ${age(x).toLowerCase()}`} right={x.liability ? `owe ${rupees(x.balance)}` : rupees(x.balance)}
                  onPress={() => setAcct(x)} chevron label={`${x.name}, ${rupees(x.balance)}, ${age(x)}`} />
              ))}
            </Group>
          </>
        ) : <Empty title="What's in your accounts" body="Type a balance and the day it was true. Nothing connects to your bank; this page only records." action="Add a balance" onAction={() => setAcct('new')} />}
      </View>

      <PutInSheet jar={putting} onClose={() => setPutting(null)} onPut={(j, n) => void putIn(j, n)} />
      <JarSheet open={!!editing} jar={editing} onClose={() => setEditing(null)} />
      <AccountSheet item={acct} onClose={() => setAcct(null)} />
    </Screen>
  );
}

export function netNote(home: Home) {
  const o = home.save.oldest;
  if (!o) return 'From the balances below';
  if (o.ageDays <= 1) return 'From balances true today';
  return `Last known. The oldest balance is from ${shortDay(o.date)}, ${o.ageDays} days ago.`;
}

function PutInSheet({ jar, onClose, onPut }: { jar: Jar | null; onClose: () => void; onPut: (j: Jar, n: number) => void }) {
  const [shown, setShown] = useState<Jar | null>(jar);
  const [v, setV] = useState('');
  if (jar && jar !== shown) { setShown(jar); setV(''); }
  const j = jar ?? shown;
  const n = amountOf(v);
  const go = () => { if (j && n) { onClose(); onPut(j, n); } };
  return (
    <Sheet open={!!jar} onClose={onClose} title={j ? `Put in ${j.name}` : ''}>
      <AmountInput value={v} onChange={setV} label="Amount in rupees" autoFocus={!!jar} onSubmit={go} />
      <Text style={t.small}>This records that you set it aside. No money moves anywhere.</Text>
      <Button label={n ? `Put in ${rupees(n)}` : 'Put in'} onPress={go} disabled={!n} />
    </Sheet>
  );
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
      <Text style={t.label}>Target</Text>
      <AmountInput value={target} onChange={setTarget} label="Target in rupees" autoFocus={false} />
      <Text style={t.label}>{due ? `By ${monthLabel(due)}` : 'By when'}</Text>
      <ChipRow>
        <Chip label="No date" selected={due == null} onPress={() => setDue(null)} />
        {months.map((m) => <Chip key={m} label={monthLabel(m)} selected={due === m} onPress={() => setDue(m)} />)}
      </ChipRow>
      {live.length ? (
        <>
          <Text style={t.label}>For a Mission goal</Text>
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
          <View style={s.wrap}>{KINDS.map((k) => <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />)}</View>
        </>
      ) : <Text style={t.small}>{typeof x === 'object' && x ? `Last set ${age(x).toLowerCase()}. Type what it holds today.` : ''}</Text>}
      <Text style={t.label}>{['card', 'loan'].includes(kind) ? 'What you owe today' : 'Balance today'}</Text>
      <AmountInput value={bal} onChange={setBal} label="Balance in rupees" autoFocus={!!item && !isNew} />
      <Button label="Save" onPress={() => void save()} disabled={n == null || !name.trim()} />
      {!isNew ? <Button label="Remove" kind="quiet" onPress={() => void remove()} /> : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  part: { gap: SP[12] },
  row: { flexDirection: 'row', alignItems: 'center', gap: SP[8] },
  mini: { gap: SP[8], paddingVertical: SP[12] },
  jar: { gap: SP[8], paddingVertical: SP[16] },
  actions: { flexDirection: 'row', gap: SP[8], marginTop: SP[4] },
  net: { gap: SP[4] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8] },
});
