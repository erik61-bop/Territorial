import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame, nameOf, colorIndexOf, defenseOf } from '../state/store';
import { cssPlayer } from '../render/colors';
import { sendChat, sendDiplo, sendAction } from '../net/socket';

// Tap-to-inspect: shows the selected nation's army/land/relation and quick diplomacy/attack actions.
export default function Inspect() {
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const narrow = winW < 480;
  const sel = useGame((s) => s.selected);
  const setSelected = useGame((s) => s.setSelected);
  const snap = useGame((s) => s.snap);
  const map = useGame((s) => s.map);
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
  const theirDef = defenseOf(snap, sel);
  // Can my current push crack one of their border cells? wave = my army × send% × my morale ×
  // war-escalation (attacks grow stronger the longer the war runs — why a small army can break a big
  // one late game). It must clear their per-cell defence by the break margin (~1.3). A teaching estimate.
  const myArmy = snap.army?.[playerId] ?? 0;
  const myMom = (snap.morale?.[playerId] ?? 100) / 100;
  const esc = snap.phase === 1 ? 1 + Math.max(0, (snap.tick ?? 0) - 200) * 0.005 : 1;
  const wave = myArmy * fraction * myMom * esc;
  // Do I share a LAND border with them? If not, attacking is a naval invasion (≈NAVAL_COST_MULT dearer).
  let landAdjacent = false;
  if (map && !me) {
    const W = map.width, H = map.height, o = snap.owner;
    for (let i = 0; i < o.length && !landAdjacent; i++) {
      if (o[i] !== playerId) continue;
      const x = i % W, y = (i / W) | 0;
      if ((x > 0 && o[i - 1] === sel) || (x < W - 1 && o[i + 1] === sel) ||
          (y > 0 && o[i - W] === sel) || (y < H - 1 && o[i + W] === sel)) landAdjacent = true;
    }
  }
  const naval = !me && !landAdjacent;
  const effWave = naval ? wave / 2.5 : wave;   // naval cells cost ~NAVAL_COST_MULT more
  // theirDef already reflects the ~2x defender advantage; add the per-tile occupation cost
  // (ATTACK_COST_FRAC of my army) so the estimate matches real combat.
  const occ = 0.01 * myArmy;
  const canBreak = effWave > theirDef * 1.15 + occ;

  return (
    <View style={[styles.card, narrow && { top: undefined, bottom: 162 + insets.bottom, maxWidth: winW - 24, minWidth: 0 }]}>
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: cssPlayer(colorIndexOf(snap, sel)) }]} />
        <Text style={styles.title}>{nameOf(snap, sel, playerId)}</Text>
        <Text style={[styles.rel, { color: relColor }]}>{relName}</Text>
        <Pressable onPress={() => setSelected(null)} hitSlop={8}><Text style={styles.close}>✕</Text></Pressable>
      </View>
      <Text style={styles.stat}>army <Text style={styles.val}>{army}</Text>    land <Text style={styles.val}>{land}</Text>    🛡 weak point <Text style={[styles.val, { color: '#86d6ff' }]}>{theirDef.toFixed(1)}</Text><Text style={styles.unit}>/cell</Text></Text>

      {naval && <Text style={styles.naval}>⚓ Across the sea — ships in (costs ~2.5× more)</Text>}
      {!me && (
        <Text style={[styles.break, { color: canBreak ? '#8affb0' : '#ff9f8f' }]}>
          {canBreak ? `⚔ Your push (~${Math.round(effWave)}) can crack their line` : `✋ Too strong (push ~${Math.round(effWave)} vs def ${theirDef.toFixed(1)}) — mass up`}
        </Text>
      )}

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
  stat: { color: '#cdd6f4', fontSize: 14, marginBottom: 6 },
  val: { color: '#fff', fontWeight: '800' },
  unit: { color: '#8aa0c8', fontSize: 11 },
  break: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  naval: { color: '#86d6ff', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btn: { backgroundColor: '#262d40', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  atk: { backgroundColor: '#7a2a26' },
  brk: { backgroundColor: '#3a2a50' },
  btnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
