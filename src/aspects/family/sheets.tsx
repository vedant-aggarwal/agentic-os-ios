import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Chip, DayPicker, Field, Icon, MonthDayPicker, myDay, Press, R, Row, Sheet, shortDay, SURF, t, today, useAspect } from '@/aspects/kit';
import { newId, useCollection } from '@/lib/mod';
import { C } from '@/theme';
import { amendMoment, errText, momentDraft, moments, names, pickPhoto, refresh, sendPhoto, whenDay, yesterday, type LocalPhoto } from './data';
import type { DateDoc, IdeaDoc, MomentBrief, PersonDoc } from './types';
import { G, Photo } from './ui';

// The quick jobs, each one sheet: add a memory (or time together, or a photo for a moment), save something a person
// mentioned, add a date, write his own small thing, add someone to Family, look at one memory.

type P = { id: string; name: string };

/** Choose people from Family: several, or exactly one. */
function PeopleChips({ people, value, onChange, single }: { people: P[]; value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  return (
    <View style={s.chips}>
      {people.map((p) => {
        const on = value.includes(p.id);
        return <Chip key={p.id} label={p.name} selected={on} onPress={() => onChange(single ? [p.id] : on ? value.filter((x) => x !== p.id) : [...value, p.id])} />;
      })}
    </View>
  );
}

function Problem({ text }: { text: string | null }) {
  return text ? <Text style={[t.small, { color: C.danger }]} accessibilityLiveRegion="polite">{text}</Text> : null;
}

/** Pick a photo, see it, change or drop it. */
function PhotoPick({ photo, onChange, onError }: { photo: LocalPhoto | null; onChange: (p: LocalPhoto | null) => void; onError: (m: string) => void }) {
  const pick = async () => { try { const p = await pickPhoto(); if (p) onChange(p); } catch (e) { onError(errText(e)); } };
  if (!photo) {
    return (
      <Press label="Add a photo" onPress={pick} style={s.photoEmpty}>
        <G name="photo" size={22} color={C.textSoft} />
        <Text style={[t.label, { color: C.textSoft }]}>Add a photo</Text>
      </Press>
    );
  }
  const ratio = photo.width && photo.height ? Math.min(Math.max(photo.width / photo.height, 0.75), 1.78) : 1.33;
  return (
    <View style={s.photoWrap}>
      <Image source={{ uri: photo.uri }} style={[s.photoPreview, { aspectRatio: ratio }]} contentFit="cover" accessibilityLabel="The photo you picked" />
      <View style={s.photoActions}>
        <Button label="Change" kind="quiet" small onPress={pick} />
        <Button label="Remove" kind="quiet" small onPress={() => onChange(null)} />
      </View>
    </View>
  );
}

export type MemoryPreset = { kind: 'memory' | 'together' | 'attach'; people?: string[]; date?: string; moment?: string; title?: string; focus?: 'photo' | 'line' };

/** A memory: a photo and a line, the people in it, the day. Or time together ("Something else"). Or a photo and a line for a moment that exists. */
export function MemorySheet({ open, onClose, people, preset, notice }: { open: boolean; onClose: () => void; people: P[]; preset: MemoryPreset; notice: (t: string) => void }) {
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [line, setLine] = useState('');
  const [title, setTitle] = useState('');
  const [who, setWho] = useState<string[]>(preset.people ?? (people.length === 1 ? [people[0].id] : []));
  const [day, setDay] = useState(preset.date ?? today());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const attach = preset.kind === 'attach';
  const together = preset.kind === 'together';
  const ready = attach ? !!(photo || line.trim()) : together ? !!title.trim() && who.length > 0 : !!(photo || line.trim()) && who.length > 0;
  const days = [...new Set([preset.date, today(), yesterday()].filter((d): d is string => !!d))];
  const save = async () => {
    if (!ready || busy) return;
    setBusy(true); setErr(null);
    try {
      const ph = photo ? await sendPhoto(photo, attach ? preset.people ?? [] : who) : null;
      if (attach && preset.moment) {
        await amendMoment(preset.moment, { ...(ph ? { photo: ph } : {}), ...(line.trim() ? { note: line.trim() } : {}) });
      } else {
        await moments.put(momentDraft({
          people: who, date: day, at: day === today() ? undefined : null,
          title: together ? title.trim() : preset.title ?? null, note: line.trim() || null, photo: ph, memory: !together || undefined,
        }));
      }
      refresh();
      notice(together ? 'Saved' : 'Memory saved');
      onClose();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title={attach ? 'Add to this moment' : together ? 'Time together' : 'A memory'}>
      {together ? <Field label="What did you do?" value={title} onChangeText={setTitle} placeholder="Went to the temple together" autoFocus maxLength={80} /> : null}
      <PhotoPick photo={photo} onChange={setPhoto} onError={setErr} />
      <Field label={together ? 'A line, if you like' : 'A line'} value={line} onChangeText={setLine} placeholder="What happened, in a few words"
        multiline autoFocus={preset.focus === 'line'} maxLength={400} />
      {attach ? null : (
        <>
          <View style={s.group}><Text style={t.label}>Who was there</Text><PeopleChips people={people} value={who} onChange={setWho} /></View>
          <View style={s.group}>
            <Text style={t.label}>When</Text>
            <View style={s.chips}>{days.map((d) => <Chip key={d} label={d === today() ? 'Today' : d === yesterday() ? 'Yesterday' : shortDay(d)} selected={day === d} onPress={() => setDay(d)} />)}</View>
          </View>
        </>
      )}
      <Problem text={err} />
      <Button label={busy ? 'Saving' : 'Save'} onPress={save} disabled={!ready} busy={busy} />
    </Sheet>
  );
}

const MENTION_KINDS = [
  { key: 'want', label: 'They want it', kind: 'gift' as const, likes: false },
  { key: 'like', label: 'They like it', kind: 'gift' as const, likes: true },
  { key: 'for', label: 'Do for them', kind: 'showup' as const, likes: false },
  { key: 'with', label: 'Do together', kind: 'plan' as const, likes: false },
];
/** Something a person mentioned wanting or liking, saved the moment he hears it. */
export function MentionSheet({ open, onClose, people, person, notice }: { open: boolean; onClose: () => void; people: P[]; person?: string; notice: (t: string) => void }) {
  const ideas = useCollection<IdeaDoc>('people', 'ideas');
  const [who, setWho] = useState<string[]>(person ? [person] : people.length === 1 ? [people[0].id] : []);
  const [text, setText] = useState('');
  const [kind, setKind] = useState('want');
  const [err, setErr] = useState<string | null>(null);
  const ready = !!text.trim() && who.length === 1;
  const save = () => {
    if (!ready) return;
    const k = MENTION_KINDS.find((x) => x.key === kind)!;
    void ideas.put({ person: who[0], aspect: 'family', kind: k.kind, title: text.trim(), from: 'mentioned', likes: k.likes || undefined, done: false, by: 'you' })
      .then(() => refresh())
      .catch((e) => notice(`Couldn't save that: ${errText(e)}`));
    notice('Saved for later');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="They mentioned something">
      {people.length > 1 ? <PeopleChips people={people} value={who} onChange={setWho} single /> : null}
      <Field value={text} onChangeText={(v) => { setText(v); setErr(null); }} placeholder="A warm shawl, a new phone cover" autoFocus maxLength={120} onSubmit={save} label="What was it?" />
      <View style={s.chips}>{MENTION_KINDS.map((k) => <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />)}</View>
      <Problem text={err} />
      <Button label="Save" onPress={save} disabled={!ready} />
    </Sheet>
  );
}

const KINDS = [
  { key: 'birthday', label: 'Birthday' }, { key: 'anniversary', label: 'Anniversary' }, { key: 'festival', label: 'Festival' }, { key: 'other', label: 'Something else' },
] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pad = (n: number) => String(n).padStart(2, '0');

/** A birthday, the anniversary, a festival or another day. Birthdays and anniversaries come round every year. */
export function DateSheet({ open, onClose, people, preset, notice }: {
  open: boolean; onClose: () => void; people: P[]; preset?: { kind?: DateDoc['kind']; people?: string[] }; notice: (t: string) => void;
}) {
  const dates = useCollection<DateDoc>('people', 'dates');
  const [kind, setKind] = useState<DateDoc['kind']>(preset?.kind ?? 'birthday');
  const [who, setWho] = useState<string[]>(preset?.people ?? (kind === 'anniversary' ? people.slice(0, 2).map((p) => p.id) : people.length === 1 ? [people[0].id] : []));
  const [title, setTitle] = useState('');
  const now = today();
  const [month, setMonth] = useState(Number(now.slice(5, 7)));
  const [day, setDay] = useState(Number(now.slice(8, 10)));
  const [on, setOn] = useState(myDay()); // a one-off day: the exact day, picked from the next two weeks or a month grid
  const passed = !(kind === 'birthday' || kind === 'anniversary') && on < myDay();
  const [year, setYear] = useState('');
  const yearly = kind === 'birthday' || kind === 'anniversary';
  const y = Number(year);
  const yearOk = !year.trim() || (/^\d{4}$/.test(year.trim()) && y > 1900 && y <= Number(now.slice(0, 4)));
  const ready = who.length > 0 && (yearly || !!title.trim()) && yearOk && !passed && (kind !== 'birthday' || who.length === 1);
  const max = DAYS_IN[month - 1];
  const d = Math.min(day, max);
  const save = () => {
    if (!ready) return;
    const md = yearly ? `${pad(month)}-${pad(d)}` : on.slice(5);
    const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '';
    const same = kind === 'birthday' ? (dates.items ?? []).find((x) => x.kind === 'birthday' && x.people?.length === 1 && x.people[0] === who[0]) : null;
    const doc: Omit<DateDoc, 'id'> & { id?: string } = {
      id: same?.id ?? (kind === 'birthday' ? `dt-bday-${who[0]}` : newId('dt')),
      kind, people: who, aspect: 'family', md, annual: yearly, date: yearly ? null : on, year: yearly && year.trim() ? y : null,
      title: kind === 'birthday' ? `${nameOf(who[0])}'s birthday` : kind === 'anniversary' ? (title.trim() || `${names(who.map(nameOf))}'s anniversary`) : title.trim(),
      source: 'you',
    };
    void dates.put(doc).then(() => refresh()).catch((e) => notice(`Couldn't save the date: ${errText(e)}`));
    notice('Date saved');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="A date">
      <View style={s.chips}>{KINDS.map((k) => <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => {
        setKind(k.key);
        if (k.key === 'birthday' && who.length > 1) setWho(who.slice(0, 1));
        // an anniversary is a couple's: fill in the first two when fewer are chosen
        if (k.key === 'anniversary' && who.length < 2 && people.length >= 2) setWho([...new Set([...who, ...people.map((p) => p.id)])].slice(0, 2));
      }} />)}</View>
      <View style={s.group}><Text style={t.label}>{kind === 'birthday' ? 'Whose' : 'For'}</Text><PeopleChips people={people} value={who} onChange={setWho} single={kind === 'birthday'} /></View>
      {kind === 'festival' || kind === 'other' || kind === 'anniversary' ? (
        <Field label={kind === 'anniversary' ? 'Name, if you like' : 'What is it?'} value={title} onChangeText={setTitle}
          placeholder={kind === 'festival' ? 'Diwali, Raksha Bandhan' : kind === 'anniversary' ? 'Their anniversary' : 'A day that matters'} maxLength={60} />
      ) : null}
      {yearly ? (
        <>
          <View style={s.group}>
            <Text style={t.label}>Month</Text>
            <View style={s.months}>
              {MONTHS.map((m, i) => <Chip key={m} label={m} selected={month === i + 1} onPress={() => setMonth(i + 1)} wrap={s.month} />)}
            </View>
          </View>
          <View style={s.group}>
            <Text style={t.label}>{`Day: ${d} ${MONTHS[month - 1]}`}</Text>
            <MonthDayPicker value={d} onChange={(v) => setDay(Math.min(v, max))} />
          </View>
        </>
      ) : (
        <View style={s.group}><Text style={t.label}>Day</Text><DayPicker value={on} onChange={setOn} /></View>
      )}
      {yearly ? <Field label="Year, if you know it" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} placeholder={kind === 'anniversary' ? 'The year they married' : 'The year of birth'} /> : null}
      {!yearOk ? <Problem text="That year doesn't look right." /> : null}
      {passed ? <Problem text="That day has passed. Pick one coming up." /> : null}
      {!yearly ? <Text style={t.small}>{`Saved for ${shortDay(on)}${on.slice(0, 4) !== now.slice(0, 4) ? ` ${on.slice(0, 4)}` : ''}. Festivals move each year, so add next year's when it is known.`}</Text> : null}
      <Button label="Save" onPress={save} disabled={!ready} />
    </Sheet>
  );
}

/** His own small thing for this week. */
export function OwnSheet({ open, onClose, name, onSave }: { open: boolean; onClose: () => void; name: string; onSave: (title: string) => void }) {
  const [text, setText] = useState('');
  const save = () => { if (!text.trim()) return; onSave(text.trim()); onClose(); };
  return (
    <Sheet open={open} onClose={onClose} title={`Something for ${name}`}>
      <Field value={text} onChangeText={setText} placeholder="Fix the light in the kitchen" autoFocus maxLength={80} onSubmit={save} label="What will you do this week?" />
      <Button label="Make it this week's" onPress={save} disabled={!text.trim()} />
    </Sheet>
  );
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'person';
/** Someone in his family, added by him. */
export function PersonSheet({ open, onClose, notice }: { open: boolean; onClose: () => void; notice: (t: string) => void }) {
  const persons = useCollection<PersonDoc>('people', 'persons');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [pronoun, setPronoun] = useState<'he' | 'she' | 'they'>('they');
  const ready = !!name.trim() && !!persons.items;
  const save = () => {
    if (!ready) return;
    const all = persons.items ?? [];
    let id = slug(name);
    for (let i = 2; all.some((p) => p.id === id); i++) id = `${slug(name)}-${i}`;
    const sort = Math.max(0, ...all.map((p) => Number(p.sort ?? 0))) + 1;
    void persons.put({ id, name: name.trim(), rel: 'family', aspect: 'family', role: role.trim() || null, pronoun, sort, by: 'you' } as PersonDoc)
      .then(() => refresh()).catch((e) => notice(`Couldn't add them: ${errText(e)}`));
    notice(`${name.trim()} is in Family`);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Someone in your family">
      <Field label="Name" value={name} onChangeText={setName} placeholder="What you call them" autoFocus maxLength={40} />
      <Field label="Who they are, if you like" value={role} onChangeText={setRole} placeholder="Grandmother, cousin" maxLength={40} />
      <View style={s.chips}>{(['he', 'she', 'they'] as const).map((p) => <Chip key={p} label={p === 'he' ? 'He' : p === 'she' ? 'She' : 'They'} selected={pronoun === p} onPress={() => setPronoun(p)} />)}</View>
      <Button label="Add" onPress={save} disabled={!ready} />
    </Sheet>
  );
}

/** The plus menu: the four things that start from nothing. */
export function AddSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (k: 'memory' | 'mention' | 'date' | 'person') => void }) {
  const { color } = useAspect();
  const rows = [
    { k: 'memory' as const, title: 'A memory', sub: 'A photo and a line', icon: <G name="photo" color={color} /> },
    { k: 'mention' as const, title: 'Something they mentioned', sub: 'A thing they want or like', icon: <G name="quote" color={color} /> },
    { k: 'date' as const, title: 'A date', sub: 'A birthday, the anniversary, a festival', icon: <Icon name="calendar" color={color} /> },
    { k: 'person' as const, title: 'Someone in your family', sub: null, icon: <G name="personPlus" color={color} /> },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Add">
      <View>{rows.map((r) => <Row key={r.k} title={r.title} sub={r.sub} left={<View style={s.menuIcon}>{r.icon}</View>} onPress={() => onPick(r.k)} chevron />)}</View>
    </Sheet>
  );
}

/** One memory, large, with a way to add to it or take it away. */
export function MemoryView({ open, onClose, m, nameOf, onAttach, notice }: {
  open: boolean; onClose: () => void; m: MomentBrief | null; nameOf: (id: string) => string; onAttach: (m: MomentBrief) => void; notice: (t: string) => void;
}) {
  const { width } = useAspect();
  // armed for one memory only, and only while it is open: the next memory always starts unarmed
  const [armed, setArmed] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (!open) setArmed(null); }
  if (!m) return null;
  const sure = open && armed === m.id;
  const close = () => { setArmed(null); onClose(); };
  const remove = () => {
    if (!sure) { setArmed(m.id); return; }
    void moments.remove(m.id).then(() => refresh()).catch((e) => notice(`Couldn't remove it: ${errText(e)}`));
    notice('Removed');
    close();
  };
  return (
    <Sheet open={open} onClose={close}>
      {m.photo ? <Photo id={m.photo} thumb={false} style={{ width: width - 32, height: Math.round((width - 32) * 0.8), borderRadius: R.row }} label={m.note ?? m.title ?? 'A memory'} /> : null}
      <View style={s.group}>
        {m.note ? <Text style={t.lead}>{m.note}</Text> : null}
        {m.title && m.title !== m.note ? <Text style={m.note ? t.small : t.lead}>{m.title}</Text> : null}
        <Text style={t.small}>{`${names(m.people.map(nameOf))}, ${whenDay(m.date)}`}</Text>
      </View>
      <View style={s.viewActions}>
        <Button label={m.photo ? (m.note ? 'Change the line' : 'Add a line') : m.note ? 'Add a photo' : 'Add a photo or line'} kind="quiet" small onPress={() => onAttach(m)} />
        <Button label={sure ? 'Tap again to remove' : 'Remove'} kind="danger" small onPress={remove} />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { gap: 8 },
  months: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  month: { flexBasis: '22%', flexGrow: 1 },
  photoEmpty: {
    height: 96, borderRadius: R.row, borderCurve: 'continuous', backgroundColor: SURF.row, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  photoWrap: { gap: 8 },
  photoPreview: { width: '100%', borderRadius: R.row, backgroundColor: SURF.card },
  photoActions: { flexDirection: 'row', gap: 8 },
  menuIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: SURF.card, alignItems: 'center', justifyContent: 'center' },
  viewActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
