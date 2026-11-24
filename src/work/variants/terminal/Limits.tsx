import { StyleSheet, Text, View } from 'react-native';
import type { OrcaUsage, ProviderUsage, UsageWindow } from '../../types';
import { Meter } from './Meter';
import { alpha, level, M, MONO, P } from './palette';

// The centerpiece: his Claude and Codex limits as an instrument pane. Per account, label | meter | value, htop style:
// the weekly window as a tall block meter with its % big at the right, then the 5-hour window and model-only weeks
// (Fable) as short meters on the same cell grid, so the 70 and 90 marks line up down the pane.

const MAIN_H = 22;
const MINOR_H = 6;

/** A clock time, short: "4:30 pm" within 20 hours of now, else "Sun 6:30 pm". */
function clock(iso: string | null, now = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return Math.abs(t - now) < 20 * 3_600_000 ? time : `${d.toLocaleDateString('en-IN', { weekday: 'short' })} ${time}`;
}

const resetWhen = (w: UsageWindow) => clock(w.resetsAt) ?? w.reset;

/** The worst window an account shows, for the pane's lamp. */
function peak(u: ProviderUsage | null) {
  if (!u || u.status !== 'ok') return 0;
  return Math.max(u.weekly?.usedPercent ?? 0, u.session?.usedPercent ?? 0, ...u.extra.map((e) => e.window.usedPercent));
}

/** No reading for an account: still the instrument's shape, so nothing jumps when the numbers arrive. */
function Blank({ name, note, warn = false }: { name: string; note: string | null; warn?: boolean }) {
  return (
    <View accessible accessibilityLabel={note ? `${name}: ${note}` : `${name} usage loading`} style={s.provider}>
      <View style={s.head}>
        <Text style={s.name}>{name}</Text>
        {note ? <Text numberOfLines={1} style={[s.note, warn && { color: P.amber }]}>{note}</Text> : null}
      </View>
      <View style={s.row}>
        <Text style={s.rowLabel}>week</Text>
        <View style={s.meter}><Meter pct={null} height={MAIN_H} /></View>
        <Text style={[s.big, s.bigEmpty]}>--</Text>
      </View>
    </View>
  );
}

function Provider({ name, u, delay }: { name: string; u: ProviderUsage | null; delay: number }) {
  const main = u?.weekly ?? u?.session ?? null;
  if (!u || u.status !== 'ok' || !main) {
    const signedOut = !!u && u.status !== 'ok';
    return <Blank name={name} note={signedOut ? 'Not signed in on the PC' : 'Not available'} warn={signedOut} />;
  }
  const minor = [
    ...(u.weekly && u.session ? [{ label: '5h', a11y: '5-hour window', w: u.session }] : []),
    ...u.extra.map((e) => ({ label: e.label, a11y: e.label, w: e.window })),
  ];
  const p = Math.round(main.usedPercent);
  const when = resetWhen(main);
  const label = `${name}: ${p}% of the ${u.weekly ? 'week' : '5 hours'} used${when ? `, resets ${when}` : ''}`
    + (minor.length ? `. ${minor.map((m) => `${m.a11y} ${Math.round(m.w.usedPercent)}%`).join(', ')}` : '');
  return (
    <View accessible accessibilityLabel={label} style={s.provider}>
      <View style={s.head}>
        <Text style={s.name}>{name}</Text>
        {when ? <Text numberOfLines={1} style={s.note}><Text style={s.noteDim}>resets </Text>{when}</Text> : null}
      </View>
      <View style={s.row}>
        <Text style={s.rowLabel}>{u.weekly ? 'week' : '5h'}</Text>
        <View style={s.meter}><Meter pct={p} height={MAIN_H} delay={delay} /></View>
        <Text style={[s.big, { color: level(p), textShadowColor: alpha(level(p), 0.45) }]}>
          {p}<Text style={s.unit}>%</Text>
        </Text>
      </View>
      {minor.map((m, i) => {
        const q = Math.round(m.w.usedPercent);
        return (
          <View key={`${m.label}:${i}`} style={s.minorRow}>
            <Text numberOfLines={1} style={s.rowLabel}>{m.label}</Text>
            <View style={s.meter}><Meter pct={q} height={MINOR_H} delay={delay + 160 + i * 90} /></View>
            <Text style={[s.small, q >= 70 && { color: level(q) }]}>{q}%</Text>
          </View>
        );
      })}
    </View>
  );
}

/** `usage` null: loading cells, or a line saying when usage shows (Orca not running, or the PC not answering). */
export function Limits({ usage, up, unreachable }: { usage: OrcaUsage | null; up: boolean | null; unreachable: boolean }) {
  const off = !usage && (up === false || unreachable);
  const worst = usage ? Math.max(peak(usage.claude), peak(usage.codex)) : null;
  const lamp = worst == null ? P.faint : level(worst);
  const asOf = usage ? clock(usage.at) : null;
  const status = usage ? (asOf ? `as of ${asOf}` : '') : off ? (up === false ? 'orca off' : 'no answer') : 'reading…';
  return (
    <View style={s.pane}>
      <View style={s.strip}>
        <View style={[s.lamp, { backgroundColor: lamp }, worst != null && { boxShadow: `0 0 6px ${lamp}` }]} />
        <Text style={[M.label, s.stripLabel]}>Limits</Text>
        <View style={s.stripRule} />
        {status ? <Text numberOfLines={1} style={M.meta}>{status}</Text> : null}
      </View>
      <View style={s.body}>
        {off ? (
          <Text style={s.off}>{up === false ? 'Usage shows while Orca is open on your PC.' : 'Usage shows once your PC answers.'}</Text>
        ) : (
          <>
            {usage ? <Provider name="Claude" u={usage.claude} delay={60} /> : <Blank name="Claude" note={null} />}
            <View style={s.divider} />
            {usage ? <Provider name="Codex" u={usage.codex} delay={260} /> : <Blank name="Codex" note={null} />}
          </>
        )}
      </View>
      {/* HUD corner ticks */}
      <View pointerEvents="none" style={[s.tick, s.tl]} />
      <View pointerEvents="none" style={[s.tick, s.tr]} />
      <View pointerEvents="none" style={[s.tick, s.bl]} />
      <View pointerEvents="none" style={[s.tick, s.br]} />
    </View>
  );
}

const LABEL_W = 40;
const VALUE_W = 54;
const TICK = 9;

const s = StyleSheet.create({
  pane: { borderWidth: 1, borderColor: P.rule, borderRadius: 3, backgroundColor: P.pane },
  strip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 28, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: P.rule, backgroundColor: 'rgba(61,220,151,0.045)',
  },
  lamp: { width: 6, height: 6, borderRadius: 3 },
  stripLabel: { color: P.green },
  stripRule: { flex: 1, height: 1, backgroundColor: P.rule },
  body: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 14 },
  divider: { height: 1, marginVertical: 12, backgroundColor: 'rgba(61,220,151,0.09)' },

  provider: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  name: { fontFamily: MONO, fontWeight: '700', fontSize: 12, lineHeight: 16, letterSpacing: 1.8, textTransform: 'uppercase', color: P.text },
  note: { flexShrink: 1, fontFamily: MONO, fontSize: 11, lineHeight: 16, color: P.soft, fontVariant: ['tabular-nums'] },
  noteDim: { color: P.dim },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
  minorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 14 },
  rowLabel: { width: LABEL_W, ...StyleSheet.flatten(M.label), lineHeight: 14 },
  meter: { flex: 1 },
  big: {
    width: VALUE_W, textAlign: 'right', fontFamily: MONO, fontWeight: '700', fontSize: 24, lineHeight: 30,
    letterSpacing: -0.5, fontVariant: ['tabular-nums'], textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10,
  },
  bigEmpty: { color: P.faint },
  unit: { fontSize: 13, letterSpacing: 0 },
  small: { width: VALUE_W, textAlign: 'right', fontFamily: MONO, fontSize: 11, lineHeight: 14, color: P.soft, fontVariant: ['tabular-nums'] },
  off: { fontFamily: MONO, fontSize: 12, lineHeight: 18, color: P.soft },

  tick: { position: 'absolute', width: TICK, height: TICK, borderColor: P.ruleStrong },
  tl: { top: -1, left: -1, borderTopWidth: 1, borderLeftWidth: 1, borderTopLeftRadius: 3 },
  tr: { top: -1, right: -1, borderTopWidth: 1, borderRightWidth: 1, borderTopRightRadius: 3 },
  bl: { bottom: -1, left: -1, borderBottomWidth: 1, borderLeftWidth: 1, borderBottomLeftRadius: 3 },
  br: { bottom: -1, right: -1, borderBottomWidth: 1, borderRightWidth: 1, borderBottomRightRadius: 3 },
});
