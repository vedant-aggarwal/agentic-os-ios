import { createContext, useContext, useMemo } from 'react';
import { Linking, StyleSheet, Text } from 'react-native';
import { lightTap } from '@/components/Glass';
import { showFile } from '@/lib/fileViewer';
import { linkify } from '@/lib/linkify';
import { openLink } from '@/lib/links';
import { copyText } from '@/work/thread/ui';

// Text with its links made tappable: web addresses open in the browser, agenticos:// links go to openLink, and file
// paths on the PC open in the file sheet. A long press copies the link or path. Render it inside a <Text>.
// Relative paths (src/foo.ts) resolve against the working folder of the job whose thread this is.

export const FolderContext = createContext<string | null>(null);

export function Linked({ text, folder }: { text: string; folder?: string | null }) {
  const ctx = useContext(FolderContext);
  const dir = folder === undefined ? ctx : folder;
  const segs = useMemo(() => linkify(text, { folder: dir }), [text, dir]);
  if (segs.length === 1 && segs[0].t === 'text') return <>{text}</>;
  return (
    <>
      {segs.map((g, i) => {
        if (g.t === 'text') return g.text;
        const copy = () => { lightTap(); void copyText(g.t === 'file' ? g.path : g.url); };
        const open = () => {
          if (g.t === 'url') Linking.openURL(g.url).catch(() => {});
          else if (g.t === 'app') openLink(g.url);
          else showFile(g.path, g.line);
        };
        return (
          <Text key={i} style={s.link} accessibilityRole="link" onPress={open} onLongPress={copy}>{g.text}</Text>
        );
      })}
    </>
  );
}

const s = StyleSheet.create({ link: { textDecorationLine: 'underline' } });
