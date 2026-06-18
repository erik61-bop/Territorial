import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

const LEVELS = [
  { v: 0, label: 'Easy' },
  { v: 1, label: 'Normal' },
  { v: 2, label: 'Hard' },
];

export default function Menu({ onPlay }: { onPlay: (difficulty: number) => void }) {
  const [diff, setDiff] = useState(1);
  return (
    <View style={styles.root}>
      <Text style={styles.title}>TERRITORIAL</Text>
      <Text style={styles.subtitle}>The Art of Conquest — one army is your sword and your shield.</Text>

      <Text style={styles.diffLabel}>Bot difficulty</Text>
      <View style={styles.diffRow}>
        {LEVELS.map((l) => (
          <Pressable key={l.v} onPress={() => setDiff(l.v)} style={[styles.diffBtn, diff === l.v && styles.diffActive]}>
            <Text style={[styles.diffTxt, diff === l.v && styles.diffTxtActive]}>{l.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.play} onPress={() => onPlay(diff)}>
        <Text style={styles.playTxt}>▶  Play</Text>
      </Pressable>
      <Text style={styles.hint}>
        Pick a spawn, expand during Peace, then attack, ally, and betray your way to the top before
        Final War. Tap a country to keep attacking it; Hold to stop.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d12', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 56, fontWeight: '900', letterSpacing: 4 },
  subtitle: { color: '#9aa', fontSize: 15, marginTop: 8, marginBottom: 24, textAlign: 'center' },
  diffLabel: { color: '#8aa0c8', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  diffRow: { flexDirection: 'row', gap: 8, marginBottom: 26 },
  diffBtn: { paddingVertical: 8, paddingHorizontal: 22, borderRadius: 10, backgroundColor: '#222838', borderWidth: 1, borderColor: '#2a3145' },
  diffActive: { backgroundColor: '#2f6df0', borderColor: '#2f6df0' },
  diffTxt: { color: '#9fb0cf', fontSize: 14, fontWeight: '700' },
  diffTxtActive: { color: '#fff' },
  play: { backgroundColor: '#4c7dff', paddingVertical: 14, paddingHorizontal: 48, borderRadius: 14 },
  playTxt: { color: '#fff', fontSize: 22, fontWeight: '800' },
  hint: { color: '#667', fontSize: 13, marginTop: 28, maxWidth: 440, textAlign: 'center', lineHeight: 19 },
});
