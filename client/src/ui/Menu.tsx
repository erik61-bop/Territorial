import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export default function Menu({ onPlay }: { onPlay: () => void }) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>TERRITORIAL</Text>
      <Text style={styles.subtitle}>The Art of Conquest — one army is your sword and your shield.</Text>
      <Pressable style={styles.play} onPress={onPlay}>
        <Text style={styles.playTxt}>▶  Play</Text>
      </Pressable>
      <Text style={styles.hint}>
        Pick a spawn, expand into empty land during Peace, then attack, ally, and betray your way
        to 65% of the map before Final War.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d12', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 56, fontWeight: '900', letterSpacing: 4 },
  subtitle: { color: '#9aa', fontSize: 15, marginTop: 8, marginBottom: 28, textAlign: 'center' },
  play: { backgroundColor: '#4c7dff', paddingVertical: 14, paddingHorizontal: 48, borderRadius: 14 },
  playTxt: { color: '#fff', fontSize: 22, fontWeight: '800' },
  hint: { color: '#667', fontSize: 13, marginTop: 28, maxWidth: 420, textAlign: 'center', lineHeight: 19 },
});
