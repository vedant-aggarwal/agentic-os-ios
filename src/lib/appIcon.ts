import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

// The app's home screen icon. 'auto' is the primary icon (AppIcon: light, with a dark variant iOS shows when the phone
// is in dark mode); 'light' and 'dark' pin one look (the alternate icons AppIconLight and AppIconDark, compiled in by
// modules/app-icon/app.plugin.js). Native: modules/app-icon (AosAppIcon). Web, Android and older builds can't switch.

export type AppIconChoice = 'auto' | 'light' | 'dark';

type Native = { get(): Promise<string | null>; set(name: string | null): Promise<void> };
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<Native>('AosAppIcon') : null;

const NAMES: Record<AppIconChoice, string | null> = { auto: null, light: 'AppIconLight', dark: 'AppIconDark' };

export const appIconSupported = (): boolean => !!native;

/** The icon on the home screen now ('auto' where it can't be switched). */
export async function getAppIcon(): Promise<AppIconChoice> {
  if (!native) return 'auto';
  try {
    const name = await native.get();
    return name === NAMES.light ? 'light' : name === NAMES.dark ? 'dark' : 'auto';
  } catch {
    return 'auto';
  }
}

/** Switches the home screen icon. iOS shows its own notice that the icon changed. */
export async function setAppIcon(choice: AppIconChoice): Promise<void> {
  if (!native) throw new Error("This build can't change the app icon.");
  await native.set(NAMES[choice]);
}
