import { router, useLocalSearchParams } from 'expo-router';
import { createElement, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Chevron, InstagramMark, YouTubeMark } from '@/components/Icons';
import { BeatEditor } from '@/components/BeatEditor';
import { ConceptEditor } from '@/components/concepts/ConceptEditor';
import { KAI_BAR_SPACE, KaiBar } from '@/components/KaiBar';
import { Press } from '@/components/Press';
import { ErrorBox, Loading } from '@/components/States';
import { TextEditor } from '@/components/TextEditor';
import {
  audioUrl,
  rebuildStructure,
  recordVoiceTake,
  REEL_STAGES,
  refreshReels,
  saveVoiceText,
  selectVersion,
  startVoiceScript,
  updateReel,
  useReels,
  type Beat,
  type Reel,
  type ReelStage,
} from '@/lib/api';
import { STAGE_INFO } from '@/lib/reels';
import { slotFor } from '@/lib/lineup';
import { C, F } from '@/theme';

const TABS = REEL_STAGES.filter((s) => s !== 'idea'); // the idea is the card on top
const BY: Record<string, string> = { build: 'Written by AI', edit: 'Your edit', kai: "Kai's edit" };

export default function ReelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { reels, error, reload } = useReels();
  const reel = reels?.find((r) => r.id === id);
  const slot = reel ? slotFor(reel.channelId) : undefined;
  const doneUpTo = reel ? REEL_STAGES.indexOf(reel.stage) : -1;
  const working = !!reel?.working;
  const [tab, setTab] = useState<ReelStage | null>(null);
  const shown: ReelStage = tab ?? (reel && (reel.voice?.text || reel.working === 'voice' || reel.working === 'take') ? 'voice' : 'script');
  const [editConcept, setEditConcept] = useState(false);
  const [beatAt, setBeatAt] = useState<number | null>(null); // index being edited; beats.length = a new beat
  const [editVoice, setEditVoice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const kaiDone = useCallback(() => {
    refreshReels().catch(() => {});
  }, []);

  const run = async (f: () => Promise<unknown>) => {
    setSaveError(null);
    setPending(true);
    try {
      await f();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };
  const save = (patch: Parameters<typeof updateReel>[1]) => reel && run(() => updateReel(reel.id, patch));
  const beats = reel?.structure?.beats || [];
  const saveBeats = (next: Beat[]) => save({ structure: { lengthSeconds: reel?.structure?.lengthSeconds || 30, beats: next } });

  // While the PC is building a step, check back every few seconds.
  useEffect(() => {
    if (!working) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [working, reload]);

  const startVoice = () => {
    if (!reel) return;
    setTab('voice');
    run(() => startVoiceScript(reel.id));
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: C.bg }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + KAI_BAR_SPACE }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={C.ink} />}
      >
        <View style={styles.bar}>
          <Press style={styles.round} scale={0.92} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <Chevron />
          </Press>
          <Text style={styles.barTitle}>Reel</Text>
          <View style={{ width: 44 }} />
        </View>

        {error && !reels ? (
          <View style={{ marginTop: 16 }}>
            <ErrorBox message={error} onRetry={reload} />
          </View>
        ) : !reels ? (
          <Loading />
        ) : !reel || !slot ? (
          <View style={[styles.card, { marginTop: 16 }]}>
            <Text style={styles.title}>Reel not found</Text>
            <Text style={styles.body}>It may have been removed on the PC.</Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.channelRow}>
                <Avatar slot={slot} size={40} live />
                <Text style={styles.channelName}>{slot.name}</Text>
                {slot.platform === 'youtube' ? <YouTubeMark size={20} /> : <InstagramMark size={17} />}
                <Press style={styles.pill} scale={0.94} onPress={() => setEditConcept(true)} accessibilityLabel="Edit the concept">
                  <Text style={styles.pillText}>Edit</Text>
                </Press>
              </View>
              <Text style={styles.title}>{reel.title}</Text>
              {reel.hook ? <Text style={styles.hook}>{reel.hook}</Text> : null}
              <Text style={styles.body}>{reel.premise || reel.idea}</Text>
              {reel.direction ? (
                <View style={styles.dateChip}>
                  <Text style={styles.dateText}>{reel.direction.name}</Text>
                </View>
              ) : null}
              {reel.notes ? <Text style={styles.notes}>Your note: {reel.notes}</Text> : null}
            </View>

            {/* Production steps as tabs: done steps get a tick. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {TABS.map((st) => {
                const i = REEL_STAGES.indexOf(st);
                const done = i <= doneUpTo;
                const on = st === shown;
                return (
                  <Press key={st} style={[styles.tab, on && styles.tabOn]} scale={0.95} onPress={() => setTab(st)} accessibilityLabel={`${STAGE_INFO[st].name}${done ? ', done' : ''}`}>
                    {done ? <Text style={[styles.tabTick, on && { color: '#fff' }]}>✓</Text> : null}
                    <Text style={[styles.tabText, on && { color: '#fff' }]}>{STAGE_INFO[st].name}</Text>
                  </Press>
                );
              })}
            </ScrollView>
            {saveError ? <Text style={styles.err}>{saveError}</Text> : null}

            {shown === 'script' ? (
              <ScriptTab reel={reel} pending={pending} onBeat={setBeatAt} onVersion={(i) => run(() => selectVersion(reel.id, i))} onRebuild={() => run(() => rebuildStructure(reel.id))} onVoice={startVoice} />
            ) : shown === 'voice' ? (
              <VoiceTab
                reel={reel}
                pending={pending}
                onWrite={() => run(() => startVoiceScript(reel.id))}
                onEdit={() => setEditVoice(true)}
                onTake={() => run(() => recordVoiceTake(reel.id))}
                onScript={() => setTab('script')}
              />
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{STAGE_INFO[shown].name}</Text>
                <Text style={styles.body}>{STAGE_INFO[shown].what}. This step is coming next.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {reel ? (
        <KaiBar
          context={{ screen: shown === 'voice' ? 'reel-voiceover' : 'reel-script', reelId: reel.id, channelId: reel.channelId }}
          placeholder={shown === 'voice' ? 'Ask Kai to change the voice script' : 'Ask Kai to change this script'}
          suggestions={
            shown === 'voice'
              ? ['Make it more intense', 'More pauses before the reveal', 'Make the ending softer', 'Make it faster']
              : ['Make the hook hit harder', 'Tighten it to 30 seconds', 'Make the ending more shareable', 'Make it clear to anyone']
          }
          onDone={kaiDone}
        />
      ) : null}

      {reel && editConcept ? (
        <ConceptEditor
          concept={{ title: reel.title, hook: reel.hook || '', premise: reel.premise || reel.idea || '', why: reel.why || '' }}
          onClose={() => setEditConcept(false)}
          onSave={(c) => {
            setEditConcept(false);
            save({ title: c.title, hook: c.hook, premise: c.premise, why: c.why });
          }}
        />
      ) : null}

      {reel && beatAt != null ? (
        <BeatEditor
          beat={beats[beatAt] || { time: '', beat: '', visual: '', line: '' }}
          isNew={beatAt >= beats.length}
          onClose={() => setBeatAt(null)}
          onDelete={
            beatAt < beats.length && beats.length > 1
              ? () => {
                  const i = beatAt;
                  setBeatAt(null);
                  saveBeats(beats.filter((_, j) => j !== i));
                }
              : undefined
          }
          onSave={(b) => {
            const i = beatAt;
            setBeatAt(null);
            saveBeats(i >= beats.length ? [...beats, b] : beats.map((x, j) => (j === i ? b : x)));
          }}
        />
      ) : null}

      {reel && editVoice ? (
        <TextEditor
          title="Voice script"
          value={reel.voice?.text || ''}
          hint="Tags in [brackets] direct the voice, e.g. [whispers], [pause], [sighs]. Keep them short: long ones get read out loud."
          onClose={() => setEditVoice(false)}
          onSave={(t) => {
            setEditVoice(false);
            run(() => saveVoiceText(reel.id, t));
          }}
        />
      ) : null}
    </View>
  );
}

function Busy({ text }: { text: string }) {
  return (
    <View style={[styles.card, styles.busy]}>
      <ActivityIndicator color={C.ink} />
      <Text style={[styles.body, { flex: 1, marginTop: 0 }]}>{text}</Text>
    </View>
  );
}

function ScriptTab({ reel, pending, onBeat, onVersion, onRebuild, onVoice }: { reel: Reel; pending: boolean; onBeat: (i: number) => void; onVersion: (i: number) => void; onRebuild: () => void; onVoice: () => void }) {
  const count = reel.versionCount || 0;
  const v = reel.version ?? count - 1;
  const meta = reel.versionsMeta?.[v];
  const s = reel.structure;
  return (
    <>
      <View style={styles.h2Row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h2}>Script</Text>
          {meta ? <Text style={styles.meta}>{BY[meta.by] || 'Saved'}</Text> : null}
        </View>
        {count > 1 ? (
          <View style={styles.versions}>
            <Press style={[styles.arrow, (v <= 0 || pending) && styles.off]} disabled={v <= 0 || pending} scale={0.9} onPress={() => onVersion(v - 1)} accessibilityLabel="Previous version">
              <Chevron size={16} />
            </Press>
            <Text style={styles.vText}>
              {v + 1}/{count}
            </Text>
            <Press style={[styles.arrow, (v >= count - 1 || pending) && styles.off]} disabled={v >= count - 1 || pending} scale={0.9} onPress={() => onVersion(v + 1)} accessibilityLabel="Next version">
              <Chevron size={16} dir="right" />
            </Press>
          </View>
        ) : null}
      </View>

      {reel.working === 'script' ? (
        <Busy text="Writing the script beat by beat. This takes about a minute." />
      ) : s ? (
        <>
          <View style={styles.card}>
            <Text style={styles.len}>
              About {s.lengthSeconds} seconds · {s.beats.length} beats · tap a beat to edit
            </Text>
            {s.beats.map((b, i) => (
              <Press key={i} scale={0.99} onPress={() => onBeat(i)} style={[styles.beat, i > 0 && styles.beatLine]} accessibilityLabel={`Edit beat ${i + 1}: ${b.beat}`}>
                <Text style={styles.time}>{b.time}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.beatText}>{b.beat}</Text>
                  <Text style={styles.visual}>{b.visual}</Text>
                  {b.line ? <Text style={styles.line2}>“{b.line}”</Text> : null}
                </View>
              </Press>
            ))}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Press style={styles.redo} scale={0.97} onPress={() => onBeat(s.beats.length)} accessibilityLabel="Add a beat">
                <Text style={styles.redoText}>Add beat</Text>
              </Press>
              <Press style={styles.redo} scale={0.97} onPress={onRebuild} accessibilityLabel="Write the script again as a new version">
                <Text style={styles.redoText}>Write again</Text>
              </Press>
            </View>
          </View>
          <Press style={[styles.primary, (pending || !!reel.working) && styles.off]} disabled={pending || !!reel.working} scale={0.98} onPress={onVoice} accessibilityLabel="Start the voiceover from this version">
            <Text style={styles.primaryText}>Start voiceover</Text>
            <Text style={styles.primarySub}>{count > 1 ? `From version ${v + 1} of ${count}` : 'From this script'}</Text>
          </Press>
        </>
      ) : (
        <View style={styles.card}>
          <Text style={[styles.body, { marginTop: 0 }]}>{reel.error ? `The script failed: ${reel.error}` : 'No script yet.'}</Text>
          <Press style={styles.redo} scale={0.97} onPress={onRebuild} accessibilityLabel="Write the script">
            <Text style={styles.redoText}>{reel.error ? 'Try again' : 'Write script'}</Text>
          </Press>
        </View>
      )}
    </>
  );
}

/** The take text with its [tags] shown quieter than the spoken words. */
function Tagged({ text }: { text: string }) {
  return (
    <Text style={styles.take}>
      {text.split(/(\[[^\]]+\])/).map((part, i) =>
        /^\[[^\]]+\]$/.test(part) ? (
          <Text key={i} style={styles.tag}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

function Player({ file, label }: { file: string; label: string }) {
  const url = audioUrl(file);
  if (Platform.OS === 'web') {
    return createElement('audio', { controls: true, src: url, preload: 'none', style: { width: '100%', marginTop: 10 } });
  }
  return (
    <Press style={styles.play} scale={0.97} onPress={() => Linking.openURL(url)} accessibilityLabel={`Play ${label}`}>
      <Text style={styles.playIcon}>▶</Text>
      <Text style={styles.playText}>{label}</Text>
    </Press>
  );
}

function VoiceTab({ reel, pending, onWrite, onEdit, onTake, onScript }: { reel: Reel; pending: boolean; onWrite: () => void; onEdit: () => void; onTake: () => void; onScript: () => void }) {
  const voice = reel.voice;
  const count = reel.versionCount || 0;
  const v = reel.version ?? count - 1;
  const stale = voice?.text && voice.fromVersion != null && voice.fromVersion !== v;
  const busy = pending || !!reel.working;
  return (
    <>
      <View style={styles.h2Row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h2}>Voiceover</Text>
          <Text style={styles.meta}>
            {voice?.voiceName ? `${voice.voiceName} · ElevenLabs v4` : 'ElevenLabs v4, one continuous take'}
            {voice?.fromVersion != null && count > 1 ? ` · from script version ${voice.fromVersion + 1}` : ''}
          </Text>
        </View>
      </View>

      {voice?.error ? (
        <View style={styles.card}>
          <Text style={[styles.body, { marginTop: 0, color: '#B4232F' }]}>{voice.error}</Text>
        </View>
      ) : null}

      {reel.working === 'voice' ? (
        <Busy text="The voice director is marking up the script for ElevenLabs: emotion, pauses and emphasis. About a minute." />
      ) : !voice?.text ? (
        <View style={styles.card}>
          <Text style={[styles.body, { marginTop: 0 }]}>
            The voice director turns the script on screen into one ElevenLabs take with emotion tags, pauses and stressed words. Writing it is free; recording the voice uses credits.
          </Text>
          <Press style={[styles.primary, busy && styles.off]} disabled={busy} scale={0.98} onPress={onWrite} accessibilityLabel="Write the voice script">
            <Text style={styles.primaryText}>Write voice script</Text>
            <Text style={styles.primarySub}>{count > 1 ? `From script version ${v + 1} of ${count}` : 'From the script'}</Text>
          </Press>
        </View>
      ) : (
        <>
          {stale ? (
            <View style={[styles.card, styles.warn]}>
              <Text style={[styles.body, { marginTop: 0, flex: 1 }]}>
                Written from script version {(voice.fromVersion ?? 0) + 1}. The script on screen is version {v + 1}.
              </Text>
              <Press style={styles.redo} scale={0.97} onPress={onWrite} disabled={busy} accessibilityLabel="Write the voice script again from the version on screen">
                <Text style={styles.redoText}>Write from version {v + 1}</Text>
              </Press>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.len}>Voice script · {voice.text.length} characters</Text>
            <Tagged text={voice.text} />
            {voice.notes ? <Text style={styles.notes}>{voice.notes}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Press style={styles.redo} scale={0.97} onPress={onEdit} disabled={busy} accessibilityLabel="Edit the voice script">
                <Text style={styles.redoText}>Edit</Text>
              </Press>
              <Press style={styles.redo} scale={0.97} onPress={onWrite} disabled={busy} accessibilityLabel="Write the voice script again">
                <Text style={styles.redoText}>Write again</Text>
              </Press>
              <Press style={styles.redo} scale={0.97} onPress={onScript} accessibilityLabel="Back to the script">
                <Text style={styles.redoText}>Script</Text>
              </Press>
            </View>
          </View>

          {reel.working === 'take' ? (
            <Busy text={`Recording ${voice.voiceName || 'the voice'} with ElevenLabs. Up to a minute.`} />
          ) : (
            <Press style={[styles.primary, busy && styles.off]} disabled={busy} scale={0.98} onPress={onTake} accessibilityLabel="Generate the voice with ElevenLabs">
              <Text style={styles.primaryText}>{voice.audio ? 'Record a new take' : 'Generate voice'}</Text>
              <Text style={styles.primarySub}>
                About {voice.text.length.toLocaleString('en-US')} credits
                {voice.credits ? ` · ${voice.credits.left.toLocaleString('en-US')} left${voice.credits.resets ? `, resets ${voice.credits.resets}` : ''}` : ''}
              </Text>
            </Press>
          )}

          {voice.audio ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Take</Text>
              <Text style={styles.meta}>
                {voice.audio.voiceName}
                {voice.audio.seconds ? ` · ${voice.audio.seconds} seconds` : ''}
              </Text>
              <Player file={voice.audio.file} label={`Play the take${voice.audio.seconds ? ` (${Math.round(voice.audio.seconds)} s)` : ''}`} />
              {(voice.takes || []).slice(1).map((t) => (
                <View key={t.file} style={{ marginTop: 8 }}>
                  <Text style={styles.meta}>Earlier take · {t.seconds ? `${t.seconds} s` : ''}</Text>
                  <Player file={t.file} label="Play earlier take" />
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', height: 44 },
  pill: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: C.bg, justifyContent: 'center' },
  pillText: { fontFamily: F.s, fontSize: 13, color: C.ink },
  h2Row: { marginTop: 20, flexDirection: 'row', alignItems: 'center' },
  err: { marginTop: 8, fontFamily: F.m, fontSize: 13, color: '#B4232F' },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, textAlign: 'center', fontFamily: F.b, fontSize: 18, lineHeight: 24, color: C.ink },
  card: { marginTop: 12, padding: 16, borderRadius: 24, backgroundColor: C.card },
  cardTitle: { fontFamily: F.s, fontSize: 16, lineHeight: 22, color: C.ink },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  channelName: { flex: 1, fontFamily: F.s, fontSize: 15, color: C.ink },
  title: { marginTop: 14, fontFamily: F.b, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: C.ink },
  body: { marginTop: 6, fontFamily: F.r, fontSize: 15, lineHeight: 22, color: C.ink2 },
  dateChip: { marginTop: 14, alignSelf: 'flex-start', height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: C.bg, justifyContent: 'center' },
  dateText: { fontFamily: F.s, fontSize: 13, color: C.ink },
  hook: { marginTop: 8, fontFamily: F.s, fontSize: 16, lineHeight: 22, color: C.ink },
  notes: { marginTop: 12, fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.faint },
  tabs: { gap: 8, paddingTop: 16, paddingBottom: 2 },
  tab: { height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabOn: { backgroundColor: C.ink },
  tabText: { fontFamily: F.s, fontSize: 14, color: C.ink },
  tabTick: { fontFamily: F.b, fontSize: 13, color: C.growInk },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  warn: { gap: 4 },
  len: { fontFamily: F.s, fontSize: 13, lineHeight: 18, color: C.muted, marginBottom: 4 },
  meta: { marginTop: 2, fontFamily: F.m, fontSize: 13, lineHeight: 18, color: C.muted },
  versions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  arrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  vText: { minWidth: 34, textAlign: 'center', fontFamily: F.b, fontSize: 14, color: C.ink },
  off: { opacity: 0.35 },
  beat: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  beatLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  time: { width: 52, fontFamily: F.b, fontSize: 13, lineHeight: 20, color: C.ink },
  beatText: { fontFamily: F.s, fontSize: 15, lineHeight: 21, color: C.ink },
  visual: { marginTop: 3, fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.muted },
  line2: { marginTop: 4, fontFamily: F.m, fontSize: 14, lineHeight: 20, color: C.ink2 },
  redo: { marginTop: 12, alignSelf: 'flex-start', height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.bg, justifyContent: 'center' },
  redoText: { fontFamily: F.s, fontSize: 14, color: C.ink },
  h2: { fontFamily: F.s, fontSize: 18, lineHeight: 24, color: C.ink },
  primary: { marginTop: 12, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 22, backgroundColor: C.ink, alignItems: 'center' },
  primaryText: { fontFamily: F.b, fontSize: 16, color: '#fff' },
  primarySub: { marginTop: 2, fontFamily: F.m, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  take: { marginTop: 6, fontFamily: F.r, fontSize: 15, lineHeight: 23, color: C.ink },
  tag: { fontFamily: F.s, fontSize: 13, color: C.muted },
  play: { marginTop: 10, height: 46, borderRadius: 23, backgroundColor: C.bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  playIcon: { fontSize: 14, color: C.ink },
  playText: { fontFamily: F.s, fontSize: 15, color: C.ink },
});
