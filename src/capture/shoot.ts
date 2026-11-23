import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { pickPhoto, type Picked } from '@/aspects/body/pick';

// Where the capture panel's and Today's photos come from: the camera. A build without the camera permission string
// (before the build that set expo-image-picker "cameraPermission" in app.json) makes Expo refuse the permission ask,
// and then the library opens instead. The web preview keeps its file picker.
export const SOURCE: 'library' | 'camera' = 'camera';

type Picker = typeof import('expo-image-picker');
/* eslint-disable @typescript-eslint/no-require-imports */
const picker: Picker | null = Platform.OS !== 'web' && requireOptionalNativeModule('ExponentImagePicker') ? require('expo-image-picker') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

/** One photo for the panel, or null when cancelled. */
export async function takePhoto(): Promise<Picked | null> {
  if (SOURCE !== 'camera' || !picker) return pickPhoto();
  let perm;
  try { perm = await picker.requestCameraPermissionsAsync(); } catch { return pickPhoto(); } // no usage string in this build
  if (!perm.granted) throw new Error('Allow the camera for Agentic OS in Settings.');
  const res = await picker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, type: a.mimeType && a.mimeType !== 'image/heic' ? a.mimeType : 'image/jpeg' };
}
