import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { PLAYER_COLORS } from '../render/colors';
import { useGame } from '../state/store';

const MODES = [
  { v: true, label: '🤖 Single-player', sub: 'you vs bots, private' },
  { v: false, label: '🌐 Multiplayer', sub: 'shared room with others' },
];

const LEVELS = [
  { v: 0, label: 'Easy' },
  { v: 1, label: 'Normal' },
  { v: 2, label: 'Hard' },
];

const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;

export default function Menu({ onPlay }: { onPlay: (difficulty: number, name: string, color: number) => void }) {
  const [diff, setDiff] = useState(1);
  const [name, setName] = useState('');
  const [color, setColor] = useState(0);
  const singlePlayer = useGame((s) => s.singlePlayer);
  const setSinglePlayer = useGame((s) => s.setSinglePlayer);
  return (
    <View style={styles.root}>
      <Text style={styles.title}>TERRITORIAL</Text>
      <Text style={styles.subtitle}>The Art of Conquest — one army is your sword and your shield.</Text>

      <Text style={styles.diffLabel}>Mode</Text>
      <View style={styles.modeRow}>
        {MODES.map((m) => (
          <Pressable key={m.label} onPress={() => setSinglePlayer(m.v)}
            style={[styles.modeBtn, singlePlayer === m.v && styles.modeActive]}>
            <Text style={[styles.modeTxt, singlePlayer === m.v && { color: '#fff' }]}>{m.label}</Text>
            <Text style={[styles.modeSub, singlePlayer === m.v && { color: '#dbe6ff' }]}>{m.sub}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.diffLabel}>Your name</Text>
      <TextInput
        style={styles.nameInput}
        value={name}
        onChangeText={(t) => setName(t.slice(0, 16))}
        placeholder="Commander"
        placeholderTextColor="#566"
        maxLength={16}
      />

      <Text style={styles.diffLabel}>Your colour</Text>
      <View style={styles.colorRow}>
        {PLAYER_COLORS.map((c, i) => (
          <Pressable
            key={i}
            onPress={() => setColor(i)}
            style={[styles.swatch, { backgroundColor: rgb(c) }, color === i && styles.swatchActive]}
          />
        ))}
      </View>

      <Text style={styles.diffLabel}>Bot difficulty</Text>
      <View style={styles.diffRow}>
        {LEVELS.map((l) => (
          <Pressable key={l.v} onPress={() => setDiff(l.v)} style={[styles.diffBtn, diff === l.v && styles.diffActive]}>
            <Text style={[styles.diffTxt, diff === l.v && styles.diffTxtActive]}>{l.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.play} onPress={() => onPlay(diff, name.trim(), color)}>
        <Text style={styles.playTxt}>▶  Play</Text>
      </Pressable>
      <Text style={styles.hint}>
        Pick a spawn, expand during Peace (rivals are hidden by fog), then attack, ally, and betray
        your way to be the last one standing. Tap a country to keep attacking it; Hold to stop.
        {'\n'}Move: drag or WASD / arrows · zoom: wheel or +/− · click the minimap to jump there.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d12', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 56, fontWeight: '900', letterSpacing: 4 },
  subtitle: { color: '#9aa', fontSize: 15, marginTop: 8, marginBottom: 22, textAlign: 'center' },
  diffLabel: { color: '#8aa0c8', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  modeBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 11, backgroundColor: '#222838', borderWidth: 1, borderColor: '#2a3145', alignItems: 'center' },
  modeActive: { backgroundColor: '#2f6df0', borderColor: '#2f6df0' },
  modeTxt: { color: '#cfe0ff', fontSize: 15, fontWeight: '800' },
  modeSub: { color: '#8aa0c8', fontSize: 11, marginTop: 2 },
  nameInput: {
    width: 260, color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center',
    backgroundColor: '#222838', borderWidth: 1, borderColor: '#2a3145', borderRadius: 10,
    paddingVertical: 10, marginBottom: 20,
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 320, marginBottom: 22 },
  swatch: { width: 30, height: 30, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: '#fff' },
  diffRow: { flexDirection: 'row', gap: 8, marginBottom: 26 },
  diffBtn: { paddingVertical: 8, paddingHorizontal: 22, borderRadius: 10, backgroundColor: '#222838', borderWidth: 1, borderColor: '#2a3145' },
  diffActive: { backgroundColor: '#2f6df0', borderColor: '#2f6df0' },
  diffTxt: { color: '#9fb0cf', fontSize: 14, fontWeight: '700' },
  diffTxtActive: { color: '#fff' },
  play: { backgroundColor: '#4c7dff', paddingVertical: 14, paddingHorizontal: 48, borderRadius: 14 },
  playTxt: { color: '#fff', fontSize: 22, fontWeight: '800' },
  hint: { color: '#667', fontSize: 13, marginTop: 28, maxWidth: 440, textAlign: 'center', lineHeight: 19 },
});
