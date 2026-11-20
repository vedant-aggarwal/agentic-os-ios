import * as Haptics from 'expo-haptics';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type Props = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; scale?: number };

/** Pressable that shrinks slightly on touch-down and taps the haptic engine on release. */
export function Press({ style, scale = 0.97, onPress, ...rest }: Props) {
  return (
    <Pressable
      {...rest}
      onPress={(e) => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [style, pressed && { transform: [{ scale }], opacity: 0.92 }]}
    />
  );
}
