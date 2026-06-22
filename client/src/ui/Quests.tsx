import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { fetchQuests, claimQuest, Quest } from '../net/socket';

export default function Quests({ onClose }: { onClose: () => void }) {
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => { fetchQuests().then(setQuests); }, []);
  useEffect(() => { load(); }, [load]);

  const claim = async (q: Quest) => {
    setBusy(q.id);
    const got = await claimQuest(q.id);
    setBusy(null);
    if (got > 0) { setToast(`+${got} coins!`); setTimeout(() => setToast(null), 2500); }
    load();
  };

  return (
    <Pressable style={styles.scrim} onPress={onClose}>
      <Pressable style={styles.card} onPress={() => {}}>
        <View style={styles.head}>
          <Text style={styles.title}>🎯 Daily quests</Text>
          <Pressable onPress={onClose} hitSlop={8}><Text style={styles.close}>✕</Text></Pressable>
        </View>
        <Text style={styles.sub}>Reset every day. Complete them in matches, then claim your coins.</Text>
        {toast && <Text style={styles.toast}>🪙 {toast}</Text>}

        {quests == null ? <ActivityIndicator color="#9fb0cf" style={{ margin: 24 }} /> : quests.map((q) => {
          const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
          return (
            <View key={q.id} style={styles.quest}>
              <View style={styles.qTop}>
                <Text style={styles.qDesc}>{q.desc}</Text>
                <Text style={styles.qReward}>🪙 {q.reward}</Text>
              </View>
              <View style={styles.qBottom}>
                <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }, q.complete && styles.fillDone]} /></View>
                <Text style={styles.prog}>{q.progress}/{q.target}</Text>
                {q.claimed ? <Text style={styles.claimed}>✓ Claimed</Text>
                  : q.claimable ? (
                    <Pressable style={styles.claimBtn} onPress={() => claim(q)} disabled={busy === q.id}>
                      <Text style={styles.claimTxt}>{busy === q.id ? '…' : 'Claim'}</Text>
                    </Pressable>
                  ) : <Text style={styles.locked}>In progress</Text>}
              </View>
            </View>
          );
        })}
        <Pressable style={styles.done} onPress={onClose}><Text style={styles.doneTxt}>Done</Text></Pressable>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,7,11,0.82)', alignItems: 'center', justifyContent: 'center', zIndex: 66 },
  card: { width: 440, maxWidth: '94%', backgroundColor: '#141824', borderWidth: 1, borderColor: '#2a3145', borderRadius: 16, padding: 18 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title: { color: '#8affb0', fontSize: 22, fontWeight: '900', flex: 1 },
  close: { color: '#8aa0c8', fontSize: 18, fontWeight: '800' },
  sub: { color: '#9fb0cf', fontSize: 13, marginBottom: 10 },
  toast: { color: '#0b0d14', backgroundColor: '#ffd54a', fontSize: 14, fontWeight: '900', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, alignSelf: 'center', marginBottom: 10, overflow: 'hidden' },
  quest: { backgroundColor: '#1b2030', borderRadius: 12, padding: 12, marginBottom: 10 },
  qTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  qDesc: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
  qReward: { color: '#ffd54a', fontSize: 14, fontWeight: '800' },
  qBottom: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { flex: 1, height: 9, borderRadius: 5, backgroundColor: '#0f1420', overflow: 'hidden' },
  fill: { height: 9, borderRadius: 5, backgroundColor: '#4c7dff' },
  fillDone: { backgroundColor: '#8affb0' },
  prog: { color: '#9fb0cf', fontSize: 12, fontWeight: '800', width: 34, textAlign: 'right' },
  claimBtn: { backgroundColor: '#1f7a3f', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8 },
  claimTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  claimed: { color: '#8affb0', fontSize: 13, fontWeight: '800', width: 72, textAlign: 'right' },
  locked: { color: '#7689ad', fontSize: 12, fontWeight: '700', width: 72, textAlign: 'right' },
  done: { marginTop: 6, backgroundColor: '#2f6df0', paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  doneTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
