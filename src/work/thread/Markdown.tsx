import { memo, useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Sym } from '@/components/Sym';
import { C, F } from '@/theme';
import { IcCheck, IcCopy, MONO, Press, useCopied } from './ui';

// The agent's text, readable on a phone: headings, paragraphs, lists, quotes, bold, inline code, links, and code
// blocks in a monospace box with Copy. Not a full markdown parser; tables show as preformatted text. An unclosed code
// fence (still streaming) shows as a code block so far.

type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'li'; mark: string; depth: number; text: string }
  | { t: 'quote'; text: string }
  | { t: 'code'; lang: string; text: string }
  | { t: 'pre'; text: string }
  | { t: 'hr' };

export function parseBlocks(src: string): Block[] {
  const out: Block[] = [];
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let para: string[] = [];
  const endPara = () => { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/.exec(line);
    if (fence) {
      endPara();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      out.push({ t: 'code', lang: fence[2], text: body.join('\n') });
      continue;
    }
    if (!line.trim()) { endPara(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { endPara(); out.push({ t: 'h', level: h[1].length, text: h[2].replace(/\s#+\s*$/, '') }); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { endPara(); out.push({ t: 'hr' }); continue; }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      endPara();
      const mark = /\d/.test(li[2]) ? li[2].replace(')', '.') : '•';
      out.push({ t: 'li', mark, depth: Math.min(3, Math.floor(li[1].replace(/\t/g, '  ').length / 2)), text: li[3] });
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) {
      endPara();
      const prev = out[out.length - 1];
      if (prev?.t === 'quote') prev.text += `\n${q[1]}`; else out.push({ t: 'quote', text: q[1] });
      continue;
    }
    if (/^\s*\|/.test(line)) {
      endPara();
      const prev = out[out.length - 1];
      const row = line.trim();
      if (/^\|?[\s:|-]+\|?$/.test(row) && prev?.t === 'pre') continue; // the |---|---| rule
      if (prev?.t === 'pre') prev.text += `\n${row}`; else out.push({ t: 'pre', text: row });
      continue;
    }
    // an indented line right after a list item continues it
    const prev = out[out.length - 1];
    if (!para.length && prev?.t === 'li' && /^\s{2,}\S/.test(line)) { prev.text += ` ${line.trim()}`; continue; }
    para.push(line.trim());
  }
  endPara();
  return out;
}

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\s][^*\n]*\*)/g;

function Inline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0, k = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const tok = m[0];
    if (m[1]) parts.push(<Text key={k++} style={s.code}>{tok.slice(1, -1)}</Text>);
    else if (m[2]) parts.push(<Text key={k++} style={s.bold}><Inline text={tok.slice(2, -2)} /></Text>);
    else if (m[3]) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      const url = lm?.[2] ?? '';
      parts.push(
        <Text key={k++} style={s.link} accessibilityRole="link"
          onPress={/^https?:\/\//.test(url) ? () => { Linking.openURL(url).catch(() => {}); } : undefined}>{lm?.[1] ?? tok}</Text>,
      );
    } else parts.push(<Text key={k++} style={s.em}>{tok.slice(1, -1)}</Text>); // no italics in this app
    last = at + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, copy] = useCopied();
  return (
    <View style={s.codeBox}>
      <View style={s.codeHead}>
        <Text style={s.codeLang}>{lang || 'Code'}</Text>
        <Press accessibilityLabel="Copy code" hitSlop={8} style={s.copyBtn} onPress={() => { copy(text); }}>
          {copied
            ? <Sym name="checkmark" size={13} color={C.muted} fallback={<IcCheck size={13} color={C.muted} />} />
            : <Sym name="doc.on.doc" size={13} color={C.muted} fallback={<IcCopy size={13} color={C.muted} />} />}
          <Text style={s.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
        </Press>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} alwaysBounceHorizontal={false} contentContainerStyle={s.codeScroll}>
        <Text selectable style={s.codeText}>{text}</Text>
      </ScrollView>
    </View>
  );
}

/** Rendered markdown. `tone` softens it for narration inside a step group. */
export const Markdown = memo(function Markdown({ text, tone = 'body' }: { text: string; tone?: 'body' | 'soft' }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const base = tone === 'soft' ? s.soft : s.body;
  return (
    <View style={s.wrap}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h':
            return <Text key={i} selectable accessibilityRole="header" style={[s.body, b.level === 1 ? s.h1 : b.level === 2 ? s.h2 : s.h3]}><Inline text={b.text} /></Text>;
          case 'p':
            return <Text key={i} selectable style={base}><Inline text={b.text} /></Text>;
          case 'li':
            return (
              <View key={i} style={[s.li, { paddingLeft: b.depth * 16 }]}>
                <Text style={[base, s.mark]}>{b.mark}</Text>
                <Text selectable style={[base, s.liText]}><Inline text={b.text} /></Text>
              </View>
            );
          case 'quote':
            return <View key={i} style={s.quote}><Text selectable style={[base, { color: C.muted }]}><Inline text={b.text} /></Text></View>;
          case 'code':
            return <CodeBlock key={i} lang={b.lang} text={b.text} />;
          case 'pre':
            return (
              <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false} alwaysBounceHorizontal={false}>
                <Text selectable style={s.pre}>{b.text}</Text>
              </ScrollView>
            );
          case 'hr':
            return <View key={i} style={s.hr} />;
        }
      })}
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { gap: 12 },
  body: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.textSoft },
  soft: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted },
  h1: { fontFamily: F.semibold, fontSize: 20, lineHeight: 28, color: C.text },
  h2: { fontFamily: F.semibold, fontSize: 18, lineHeight: 28, color: C.text },
  h3: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.text },
  bold: { fontFamily: F.semibold, color: C.text },
  em: { fontFamily: F.medium },
  link: { fontFamily: F.medium, color: C.text, textDecorationLine: 'underline' },
  code: { fontFamily: MONO, fontSize: 14, color: C.text, backgroundColor: 'rgba(255,255,255,0.08)' },
  li: { flexDirection: 'row', gap: 8 },
  mark: { minWidth: 16, color: C.faint },
  liText: { flex: 1 },
  quote: { borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.16)', paddingLeft: 12 },
  codeBox: {
    borderRadius: 12, borderCurve: 'continuous', backgroundColor: 'rgba(0,0,0,0.28)', overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  codeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12, paddingRight: 4, height: 32 },
  codeLang: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 8 },
  copyText: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.muted },
  codeScroll: { paddingHorizontal: 12, paddingBottom: 12 },
  codeText: { fontFamily: MONO, fontSize: 12, lineHeight: 18, color: C.textSoft },
  pre: { fontFamily: MONO, fontSize: 12, lineHeight: 18, color: C.textSoft },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)' },
});
