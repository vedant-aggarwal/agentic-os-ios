import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ago, Button, Glyph, Press, Skeleton, SURF, t, tint } from '@/aspects/kit';
import { DEMO } from '@/lib/demo';
import { downText, formatNumber, line, notSetUp, syncBlocklist, type Blocklist, type LineStatus } from '@/lib/line';
import { lineNative, type DirectoryStatus } from '@/lib/lineNative';
import { C, F } from '@/theme';
import { copy, errText, Group, GroupHead, LineScreen, LineTop, ONCALL, s as ps, StatusDot, useToast } from './parts';

// Setting up Nora's line: is it up (and why not), the Jio codes that forward his calls to her number, the code that
// stops it, the iOS setting that sends unknown numbers to her, and the phone's own blocking and caller names (the
// Call Directory extension, targets/calldirectory).

const NORA_NUMBER = '+919289063989';
const CODES = [
  { key: 'busy', title: 'When you decline, or you are on a call', code: `**67*${NORA_NUMBER}#` },
  { key: 'answer', title: "When you don't answer in 20 seconds", code: `**61*${NORA_NUMBER}**20#` },
  { key: 'reach', title: 'When your phone is off or has no signal', code: `**62*${NORA_NUMBER}#` },
] as const;
const CANCEL = '##002#';
const COPY_D = 'M9 9h10v11H9zM5 15V4h10';
const CHECK_D = 'M5 12.5l4.5 4.5L19 7.5';
const SHOW_DIRECTORY = Platform.OS === 'ios' || DEMO;

export function LineSetup() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [status, setStatus] = useState<LineStatus | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const loadStatus = useCallback(async () => {
    try { setStatus(await line.status()); setStatusErr(null); } catch (e) { setStatusErr(notSetUp(e) ? "Nora's line isn't on your PC yet." : errText(e)); }
  }, []);

  const [dir, setDir] = useState<DirectoryStatus | null>(null);
  const [list, setList] = useState<Blocklist | null>(null);
  const [syncing, setSyncing] = useState(false);
  const loadDir = useCallback(async () => {
    if (!SHOW_DIRECTORY) return;
    setDir(DEMO ? 'disabled' : await lineNative.directoryStatus());
    line.blocklist().then(setList, () => {});
  }, []);

  // on open, back from Settings, and every 15 s while the page is up
  useFocusEffect(useCallback(() => {
    void loadStatus(); void loadDir();
    const id = setInterval(() => { void loadStatus(); }, 15_000);
    return () => clearInterval(id);
  }, [loadStatus, loadDir]));
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void loadDir(); });
    return () => sub.remove();
  }, [loadDir]);

  const update = async () => {
    setSyncing(true);
    const ok = await syncBlocklist(true);
    setSyncing(false);
    toast.say(ok ? 'Call blocking is up to date' : "Couldn't update call blocking. Try again in a moment.");
    void loadDir();
  };
  const openSettings = async () => {
    if (!(await lineNative.openDirectorySettings())) toast.say('Open Settings › Apps › Phone › Call Blocking & Identification');
  };

  const up = status?.up;
  return (
    <LineScreen overlay={toast.node}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={[st.page, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) + 72 }]}>
        <LineTop title="Nora's line" sub={formatNumber(NORA_NUMBER)} backLabel="Calls" />

        <Group style={[st.card, status && !up && st.down]}>
          {status ? (
            <>
              <View style={st.inline}>
                <StatusDot color={up ? ONCALL : C.danger} />
                <Text style={t.strong}>{up ? "Nora's line is up" : "Nora's line is down"}</Text>
              </View>
              <Text style={t.small}>{up ? (status.live ? 'Nora is on a call now.' : 'Nora answers every call forwarded to her number.') : downText(status.why)}</Text>
              <Text style={t.caption}>
                {status.forwarding.lastForwardedAt ? `Last forwarded call ${ago(status.forwarding.lastForwardedAt)}` : 'No call has been forwarded yet.'}
              </Text>
            </>
          ) : statusErr ? (
            <View style={st.inline}><StatusDot color={C.faint} /><Text style={[t.small, st.flex]}>{statusErr}</Text></View>
          ) : <Skeleton height={64} />}
        </Group>

        <View>
          <GroupHead>Forward your calls to Nora</GroupHead>
          <Group>
            {CODES.map((c, i) => <CodeRow key={c.key} title={c.title} code={c.code} first={i === 0} onFail={() => toast.say("Couldn't reach the clipboard")} />)}
          </Group>
          <Text style={[t.caption, st.note]}>
            iOS won&apos;t dial these codes from a link. Copy one, paste it into the Phone app&apos;s keypad and press call. Do each once.
            To test, ring your number from another phone and decline it.
          </Text>
        </View>

        <View>
          <GroupHead>Stop forwarding</GroupHead>
          <Group>
            <CodeRow title="Turns off all three" code={CANCEL} first onFail={() => toast.say("Couldn't reach the clipboard")} />
          </Group>
        </View>

        <View>
          <GroupHead>Unknown numbers</GroupHead>
          <Group style={st.card}>
            <Text style={t.body}>Set Screen Unknown Callers to Silence and calls from numbers that aren&apos;t in your contacts go straight to Nora. Your contacts still ring you.</Text>
            <Text style={[t.small, st.path]}>Settings › Apps › Phone › Screen Unknown Callers › Silence</Text>
          </Group>
        </View>

        {SHOW_DIRECTORY ? (
          <View>
            <GroupHead>Block and name callers</GroupHead>
            <Group style={st.card}>
              <View style={st.inline}>
                <StatusDot color={dir === 'enabled' ? ONCALL : C.faint} />
                <Text style={t.strong}>{dir === 'enabled' ? 'On for this iPhone' : dir === 'none' ? 'Needs the newest build' : dir ? 'Off' : 'Checking'}</Text>
              </View>
              <Text style={t.small}>
                Numbers you block from a call stop ringing this iPhone, and the callers Nora knows show their name when they ring.
              </Text>
              {dir && dir !== 'enabled' && dir !== 'none' ? (
                <Text style={[t.small, st.path]}>Settings › Apps › Phone › Call Blocking &amp; Identification › Agentic OS</Text>
              ) : null}
              {list ? <Text style={[t.caption, t.num]}>{`${list.blocked.length} blocked · ${list.labels.length} named`}</Text> : null}
              {dir && dir !== 'none' ? (
                <View style={st.buttons}>
                  {dir !== 'enabled' ? <Button label="Open Settings" kind="quiet" small onPress={() => void openSettings()} /> : null}
                  <Button label="Update now" kind="quiet" small busy={syncing} onPress={() => void update()} />
                </View>
              ) : null}
            </Group>
          </View>
        ) : null}
      </ScrollView>
    </LineScreen>
  );
}

/** One code: what it does, the code itself, and Copy (which says Copied for a moment). */
function CodeRow({ title, code, first, onFail }: { title: string; code: string; first?: boolean; onFail: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <View style={[st.codeRow, !first && ps.rule]}>
      <View style={st.flex}>
        <Text style={t.small}>{title}</Text>
        <Text selectable style={st.code}>{code}</Text>
      </View>
      <Press label={copied ? 'Copied' : `Copy the code: ${title}`} onPress={() => { void copy(code).then((ok) => (ok ? setCopied(true) : onFail())); }}
        feel="tick" style={[st.copy, copied && st.copied]}>
        <Glyph sf={copied ? 'checkmark' : 'doc.on.doc'} d={copied ? CHECK_D : COPY_D} size={15} color={copied ? ONCALL : C.text} />
        <Text style={[st.copyText, copied && { color: ONCALL }]}>{copied ? 'Copied' : 'Copy'}</Text>
      </Press>
    </View>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  page: { paddingHorizontal: 16, gap: 24 },
  card: { padding: 16, gap: 8 },
  down: { backgroundColor: 'rgba(248,113,113,0.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(248,113,113,0.35)' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: { paddingHorizontal: 4, paddingTop: 8 },
  path: { color: C.textSoft },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  code: { fontFamily: F.medium, fontSize: 15, lineHeight: 22, letterSpacing: 0.2, color: C.text, fontVariant: ['tabular-nums'], marginTop: 2 },
  copy: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, minWidth: 88, paddingHorizontal: 14, borderRadius: 20,
    justifyContent: 'center', backgroundColor: SURF.raised,
  },
  copied: { backgroundColor: tint(ONCALL, 0.14) },
  copyText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.text },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
