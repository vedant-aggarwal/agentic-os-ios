import { requireOptionalNativeModule } from 'expo';
import type { SymbolViewProps } from 'expo-symbols';
import type { ComponentType } from 'react';
import { Platform } from 'react-native';
import { C } from '@/theme';

// Apple's SF Symbols on iOS, drawn by the system at the right optical weight; the app's own SVG elsewhere
// (web preview, Android) or on a build without expo-symbols.
let SymbolView: ComponentType<SymbolViewProps> | null = null;
if (Platform.OS === 'ios' && requireOptionalNativeModule('SymbolModule')) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SymbolView = (require('expo-symbols') as typeof import('expo-symbols')).SymbolView;
  } catch {
    SymbolView = null;
  }
}

export function Sym({ name, size = 20, color = C.text, fallback }: {
  name: SymbolViewProps['name']; size?: number; color?: string; fallback: React.ReactNode;
}) {
  if (!SymbolView) return <>{fallback}</>;
  return <SymbolView name={name} size={size} type="hierarchical" weight="medium" tintColor={color} fallback={fallback} />;
}
