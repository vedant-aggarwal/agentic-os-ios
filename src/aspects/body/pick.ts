import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

// Photos from the library: expo-image-picker on the phone (library only; the camera needs a permission that only a
// new build adds), a file input in the web preview. A build without the picker says so instead of crashing.

type Picker = typeof import('expo-image-picker');
/* eslint-disable @typescript-eslint/no-require-imports */
const picker: Picker | null = Platform.OS !== 'web' && requireOptionalNativeModule('ExponentImagePicker') ? require('expo-image-picker') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

export type Picked = { uri: string | Blob; type: string };
export const canPick = Platform.OS === 'web' || !!picker;

/** One photo, or null when cancelled. Throws with a plain reason when this build can't pick. */
export async function pickPhoto(): Promise<Picked | null> {
  if (Platform.OS === 'web') return pickWeb();
  if (!picker) throw new Error('Choosing photos arrives with the next app build.');
  const res = await picker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.9, exif: false,
    // JPEG rather than HEIC, so the PC can read it
    preferredAssetRepresentationMode: picker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, type: a.mimeType && a.mimeType !== 'image/heic' ? a.mimeType : 'image/jpeg' };
}

function pickWeb(): Promise<Picked | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.setAttribute('aria-label', 'Photo');
    input.style.display = 'none';
    input.onchange = () => {
      const f = input.files?.[0] ?? null;
      input.remove();
      resolve(f ? { uri: f, type: f.type || 'image/jpeg' } : null);
    };
    document.body.appendChild(input);
    input.click();
  });
}
