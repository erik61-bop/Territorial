import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useGame } from '../state/store';
import { sendDifficulty } from '../net/socket';

const LEVELS = [{ v: 0, label: 'Easy' }, { v: 1, label: 'Normal' }, { v: 2, label: 'Hard' }];

/** In-game settings / pause panel: sound, bot difficulty, help, and leaving the match. */
export default function Settings({ onLeave }: { onLeave: () => void }) {
  const show = useGame((s) => s.showSettings);
  const setShow = useGame((s) => s.setShowSettings);
  const muted = useGame((s) => s.muted);
  const toggleMuted = useGame((s) => s.toggleMuted);
  const difficulty = useGame((s) => s.difficulty);
  const setDifficulty = useGame((s) => s.setDifficulty);
  if (!show) return null;

  return (
    <Pressable style={styles.scrim} onPress={() => setShow(false)} onStartShouldSetResponder={() => true}>
      <Pressable style={styles.card} onPress={() => { /* absorb */ }}>
        <Text style={styles.title}>⚙  Settings</Text>

        <Text style={styles.label}>Sound</Text>
        <Pressable style={styles.row} onPress={toggleMuted}>
          <Text style={styles.rowTxt}>{muted ? '🔇  Sound off' : '🔊  Sound on'}</Text>
          <Text style={styles.toggle}>{muted ? 'tap to unmute' : 'tap to mute'}</Text>
        </Pressable>

        <Text style={styles.label}>Bot difficulty</Text>
        <View style={styles.seg}>
          {LEVELS.map((l) => (
            <Pressable key={l.v} onPress={() => { setDifficulty(l.v); sendDifficulty(l.v); }}
              style={[styles.segBtn, difficulty === l.v && styles.segActive]}>
              <Text style={[styles.segTxt, difficulty === l.v && { color: '#fff' }]}>{l.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.row} onPress={() => { setShow(false); useGame.getState().setShowHelp(true); }}>
          <Text style={styles.rowTxt}>❓  How to play</Text>
        </Pressable>

        <Pressable style={[styles.btn, styles.leave]} onPress={() => { setShow(false); onLeave(); }}>
          <Text style={styles.btnTxt}>🚪  Leave match</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.resume]} onPress={() => setShow(false)}>
          <Text style={styles.btnTxt}>▶  Resume</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,7,11,0.72)', alignItems: 'center', justifyContent: 'center', zIndex: 60 },
  card: { width: 360, maxWidth: '92%', backgroundColor: '#141824', borderWidth: 1, borderColor: '#2a3145', borderRadius: 16, padding: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 16, textAlign: 'center' },
  label: { color: '#8aa0c8', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 10, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1b2030', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 4 },
  rowTxt: { color: '#e8edf7', fontSize: 15, fontWeight: '700' },
  toggle: { color: '#8aa0c8', fontSize: 12 },
  seg: { flexDirection: 'row', gap: 6 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, backgroundColor: '#222838', borderWidth: 1, borderColor: '#2a3145', alignItems: 'center' },
  segActive: { backgroundColor: '#2f6df0', borderColor: '#2f6df0' },
  segTxt: { color: '#9fb0cf', fontSize: 13, fontWeight: '700' },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  leave: { backgroundColor: '#7a2a26' },
  resume: { backgroundColor: '#4c7dff' },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
