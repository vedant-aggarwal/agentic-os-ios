import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Backdrop } from '@/components/Backdrop';
import { Sidebar } from './Sidebar';
import { useDesk, useDesktop } from './store';

/** On a desktop browser every route sits right of the sidebar, over one shared backdrop. Elsewhere: just the route. */
export function DeskFrame({ children }: { children: React.ReactNode }) {
  const desktop = useDesktop();
  const { width } = useWindowDimensions();
  const { signedIn } = useDesk();
  if (!desktop) return <>{children}</>;
  return (
    <View style={s.row}>
      <Backdrop />
      {signedIn ? <Sidebar width={width} /> : null}
      <View style={s.page}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  page: { flex: 1, minWidth: 0 },
});
