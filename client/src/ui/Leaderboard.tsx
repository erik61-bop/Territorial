import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { fetchLeaderboard } from '../net/socket';

type Row = { name: string; wins: number; level: number; xp: number };

export default function Leaderboard({ onClose, me }: { onClose: () => void; me?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { fetchLeaderboard().then(setRows); }, []);

  return (
    <Pressable style={styles.scrim} onPress={onClose}>
      <Pressable style={styles.card} onPress={() => {}}>
        <Text style={styles.title}>🏆 Leaderboard</Text>
        {rows == null ? (
          <ActivityIndicator color="#9fb0cf" style={{ marginVertical: 30 }} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No champions yet — win a match to claim the top spot!</Text>
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            <View style={[styles.row, styles.head]}>
              <Text style={[styles.rank, styles.dim]}>#</Text>
              <Text style={[styles.name, styles.dim]}>Player</Text>
              <Text style={[styles.lvl, styles.dim]}>Lv</Text>
              <Text style={[styles.wins, styles.dim]}>Wins</Text>
            </View>
            {rows.map((r, i) => (
              <View key={i} style={[styles.row, r.name === me && styles.mine]}>
                <Text style={[styles.rank, i < 3 && styles.medal]}>{i + 1}</Text>
                <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
                <Text style={styles.lvl}>{r.level}</Text>
                <Text style={styles.wins}>{r.wins}</Text>
              </View>
            ))}
          </ScrollView>
        )}
        <Pressable style={styles.btn} onPress={onClose}><Text style={styles.btnTxt}>Close</Text></Pressable>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,7,11,0.8)', alignItems: 'center', justifyContent: 'center', zIndex: 60 },
  card: { width: 420, maxWidth: '92%', maxHeight: '82%', backgroundColor: '#141824', borderWidth: 1, borderColor: '#2a3145', borderRadius: 16, padding: 20 },
  title: { color: '#ffd54a', fontSize: 24, fontWeight: '900', marginBottom: 14, textAlign: 'center' },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#20273a' },
  head: { borderBottomColor: '#2a3145' },
  mine: { backgroundColor: 'rgba(47,109,240,0.18)', borderRadius: 8 },
  rank: { width: 34, color: '#cdd6f4', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  medal: { color: '#ffd54a' },
  name: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700', paddingHorizontal: 6 },
  lvl: { width: 44, color: '#86d6ff', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  wins: { width: 56, color: '#8affb0', fontSize: 15, fontWeight: '800', textAlign: 'right' },
  dim: { color: '#8aa0c8', fontWeight: '800', fontSize: 12 },
  empty: { color: '#9fb0cf', fontSize: 14, textAlign: 'center', marginVertical: 28, paddingHorizontal: 10 },
  btn: { marginTop: 16, backgroundColor: '#2f6df0', paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
