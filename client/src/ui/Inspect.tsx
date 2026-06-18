import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useGame } from '../state/store';
import { cssPlayer } from '../render/colors';
import { sendChat, sendDiplo, sendAction } from '../net/socket';

// Tap-to-inspect: shows the selected nation's army/land/relation and quick diplomacy/attack actions.
export default function Inspect() {
  const sel = useGame((s) => s.selected);
  const setSelected = useGame((s) => s.setSelected);
  const snap = useGame((s) => s.snap);
  const playerId = useGame((s) => s.playerId);
  const fraction = useGame((s) => s.fraction);

  if (sel == null || !snap || sel >= (snap.alive?.length ?? 0)) return null;
  if (!snap.alive[sel]) return null;

  const me = sel === playerId;
  const rel = snap.rel?.[playerId]?.[sel] ?? 0;
  const relName = me ? 'You' : rel === 2 ? 'Ally' : rel === 1 ? 'Peace' : 'Enemy';
  const relColor = me ? '#ffd54a' : rel === 2 ? '#8affb0' : rel === 1 ? '#86d6ff' : '#ff8f8f';
  const army = Math.round(snap.army[sel] ?? 0);
  const land = snap.land[sel] ?? 0;
  const cap = snap.capitals?.[sel] ?? -1;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: cssPlayer(sel) }]} />
        <Text style={styles.title}>{me ? 'You' : `Player ${sel}`}</Text>
        <Text style={[styles.rel, { color: relColor }]}>{relName}</Text>
        <Pressable onPress={() => setSelected(null)} hitSlop={8}><Text style={styles.close}>✕</Text></Pressable>
      </View>
      <Text style={styles.stat}>army <Text style={styles.val}>{army}</Text>    land <Text style={styles.val}>{land}</Text></Text>

      {!me && (
        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.atk]} onPress={() => { sendAction(sel, fraction, cap); }}>
            <Text style={styles.btnTxt}>⚔ Attack</Text>
          </Pressable>
          {rel === 0 && (
            <>
              <Pressable style={styles.btn} onPress={() => sendChat('peace_request', sel)}><Text style={styles.btnTxt}>🤝 Peace</Text></Pressable>
              <Pressable style={styles.btn} onPress={() => sendChat('ally_request', sel)}><Text style={styles.btnTxt}>🛡️ Ally</Text></Pressable>
            </>
          )}
          {rel > 0 && (
            <Pressable style={[styles.btn, styles.brk]} onPress={() => sendDiplo(rel === 2 ? 'BREAK_ALLY' : 'BREAK_PEACE', sel)}>
              <Text style={styles.btnTxt}>Break {rel === 2 ? 'alliance' : 'peace'}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute', top: 130, alignSelf: 'center', minWidth: 250,
    backgroundColor: 'rgba(15,18,28,0.95)', borderWidth: 1, borderColor: '#2a3145', borderRadius: 12, padding: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  title: { color: '#fff', fontSize: 15, fontWeight: '800' },
  rel: { fontSize: 13, fontWeight: '700', flex: 1 },
  close: { color: '#8aa0c8', fontSize: 16, fontWeight: '700' },
  stat: { color: '#cdd6f4', fontSize: 14, marginBottom: 8 },
  val: { color: '#fff', fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btn: { backgroundColor: '#262d40', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  atk: { backgroundColor: '#7a2a26' },
  brk: { backgroundColor: '#3a2a50' },
  btnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
