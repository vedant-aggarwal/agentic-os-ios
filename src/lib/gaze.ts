import type { GestureResponderEvent } from 'react-native';
import { makeMutable } from 'react-native-reanimated';

/** Where a finger is on screen, for things that watch it (the smiley). Written by Today's touch handlers. */
export const gaze = makeMutable({ x: 0, y: 0, active: false, at: 0 });

export const gazeTouch = {
  onTouchStart: (e: GestureResponderEvent) => { gaze.set({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, active: true, at: Date.now() }); },
  onTouchMove: (e: GestureResponderEvent) => { gaze.set({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, active: true, at: Date.now() }); },
  onTouchEnd: (e: GestureResponderEvent) => {
    if (!e.nativeEvent.touches.length) gaze.set({ ...gaze.get(), active: false, at: Date.now() });
  },
  onTouchCancel: () => { gaze.set({ ...gaze.get(), active: false, at: Date.now() }); },
};
