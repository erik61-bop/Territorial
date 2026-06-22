import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { fetchSeason, equipCosmetic, SeasonInfo } from '../net/socket';

export default function Season({ onClose, me }: { onClose: () => void; me?: string }) {
  const [s, setS] = useState<SeasonInfo | null>(null);
  const load = useCallback(() => { fetchSeason().then(setS); }, []);
  useEffect(() => { load(); }, [load]);

  const equipSeason = async () => { if (s) { await equipCosmetic(s.rewardId); load(); } };
  const pct = s ? Math.min(100, Math.round((s.points / s.rewardPoints) * 100)) : 0;

  return (
    <Pressable style={styles.scrim} onPress={onClose}>
      <Pressable style={styles.card} onPress={() => {}}>
        {s == null ? <ActivityIndicator color="#9fb0cf" style={{ margin: 28 }} /> : (
          <>
            <View style={styles.head}>
              <Text style={styles.title}>🏅 Season {s.season}</Text>
              <Text style={styles.timer}>⏳ {s.endsInDays}d left</Text>
              <Pressable onPress={onClose} hitSlop={8}><Text style={styles.close}>✕</Text></Pressable>
            </View>
            <Text style={styles.sub}>Climb the ladder before the season ends. Hit {s.rewardPoints} points to unlock this season's exclusive emblem {s.rewardEmoji} — gone forever once the season closes.</Text>

            <View style={styles.reward}>
              <Text style={styles.rewardEmoji}>{s.rewardEmoji}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.track}><View style={[styles.fill, s.unlocked && styles.fillDone, { width: `${pct}%` }]} /></View>
                <Text style={styles.prog}>{s.points} / {s.rewardPoints} pts</Text>
              </View>
              {s.unlocked
                ? <Pressable style={styles.equip} onPress={equipSeason}><Text style={styles.equipTxt}>Equip</Text></Pressable>
                : <Text style={styles.locked}>🔒</Text>}
            </View>

            <Text style={styles.lbTitle}>Season leaderboard</Text>
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {s.leaderboard.length === 0 ? <Text style={styles.empty}>Be the first to score this season!</Text> :
                s.leaderboard.map((r, i) => (
                  <View key={i} style={[styles.row, r.name === me && styles.mine]}>
                    <Text style={[styles.rank, i < 3 && styles.medal]}>{i + 1}</Text>
                    <Text style={styles.name} numberOfLines={1}>{r.emblem ? r.emblem + ' ' : ''}{r.name}</Text>
                    <Text style={styles.pts}>{r.points}</Text>
                  </View>
                ))}
            </ScrollView>
            <Pressable style={styles.done} onPress={onClose}><Text style={styles.doneTxt}>Done</Text></Pressable>
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,7,11,0.82)', alignItems: 'center', justifyContent: 'center', zIndex: 67 },
  card: { width: 440, maxWidth: '94%', maxHeight: '86%', backgroundColor: '#141824', borderWidth: 1, borderColor: '#2a3145', borderRadius: 16, padding: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  title: { color: '#ffd54a', fontSize: 22, fontWeight: '900', flex: 1 },
  timer: { color: '#86d6ff', fontSize: 14, fontWeight: '800' },
  close: { color: '#8aa0c8', fontSize: 18, fontWeight: '800' },
  sub: { color: '#9fb0cf', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1b2030', borderRadius: 12, padding: 12, marginBottom: 14 },
  rewardEmoji: { fontSize: 32 },
  track: { height: 10, borderRadius: 5, backgroundColor: '#0f1420', overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: '#c9a7ff' },
  fillDone: { backgroundColor: '#8affb0' },
  prog: { color: '#9fb0cf', fontSize: 12, fontWeight: '700', marginTop: 4 },
  equip: { backgroundColor: '#1f7a3f', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8 },
  equipTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  locked: { fontSize: 22 },
  lbTitle: { color: '#8aa0c8', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#20273a' },
  mine: { backgroundColor: 'rgba(47,109,240,0.18)', borderRadius: 8 },
  rank: { width: 30, color: '#cdd6f4', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  medal: { color: '#ffd54a' },
  name: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '700', paddingHorizontal: 6 },
  pts: { width: 60, color: '#c9a7ff', fontSize: 14, fontWeight: '800', textAlign: 'right' },
  empty: { color: '#9fb0cf', fontSize: 13, textAlign: 'center', marginVertical: 16 },
  done: { marginTop: 14, backgroundColor: '#2f6df0', paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  doneTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
