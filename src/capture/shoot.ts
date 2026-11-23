import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { pickPhoto, type Picked } from '@/aspects/body/pick';

// Where the capture panel's photos come from. The camera needs NSCameraUsageDescription, which this build doesn't have
// (app.json: expo-image-picker "cameraPermission": false), so photos come from the library for now.
// The switch, once a native build carries the camera permission (app.json: expo-image-picker "cameraPermission":
// "<why the camera is used>"): set SOURCE to 'camera'. Nothing else changes; the web preview keeps its file picker.
export const SOURCE: 'library' | 'camera' = 'library';

type Picker = typeof import('expo-image-picker');
/* eslint-disable @typescript-eslint/no-require-imports */
const picker: Picker | null = Platform.OS !== 'web' && requireOptionalNativeModule('ExponentImagePicker') ? require('expo-image-picker') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

/** One photo for the panel, or null when cancelled. */
export async function takePhoto(): Promise<Picked | null> {
  if (SOURCE !== 'camera' || !picker) return pickPhoto();
  const perm = await picker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Allow the camera for Agentic OS in Settings.');
  const res = await picker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, type: a.mimeType && a.mimeType !== 'image/heic' ? a.mimeType : 'image/jpeg' };
}
