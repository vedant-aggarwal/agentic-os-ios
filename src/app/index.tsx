import { StyleSheet, Text, View, useColorScheme } from 'react-native';

// Project rule: a feature that isn't built shows "Not built yet", never mock content.
export default function Home() {
  const dark = useColorScheme() === 'dark';
  return (
    <View style={[styles.screen, { backgroundColor: dark ? '#000' : '#fff' }]}>
      <Text style={[styles.text, { color: dark ? '#fff' : '#000' }]}>Not built yet</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 17 },
});
