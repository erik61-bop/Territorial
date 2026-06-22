import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { adminOverview, adminPlayers, adminGrant } from '../net/socket';

type Player = { id: number; name: string; email: string; coins: number; level: number; wins: number; games: number; admin: boolean };

export default function Admin({ onClose }: { onClose: () => void }) {
  const [ov, setOv] = useState<any>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [sel, setSel] = useState<Player | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminOverview().then(setOv);
    adminPlayers().then(setPlayers);
  }, []);
  useEffect(() => { load(); }, [load]);

  const grant = async (sign: number) => {
    const n = parseInt(amount, 10);
    if (!sel || !Number.isFinite(n) || n <= 0 || busy) return;
    setBusy(true);
    await adminGrant(sel.id, sign * n, 'admin grant');
    setBusy(false); setAmount(''); setSel(null);
    load();
  };

  const cards: [string, any][] = ov ? [
    ['Players', ov.accounts], ['Online', ov.online], ['Live rooms', ov.rooms],
    ['Coins in circ.', ov.totalCoins], ['Games', ov.gamesPlayed], ['Wins', ov.wins],
  ] : [];

  return (
    <Pressable style={styles.scrim} onPress={onClose}>
      <Pressable style={styles.card} onPress={() => {}}>
        <View style={styles.head}>
          <Text style={styles.title}>🛠 Manager dashboard</Text>
          <Pressable onPress={load} hitSlop={8}><Text style={styles.refresh}>↻ Refresh</Text></Pressable>
          <Pressable onPress={onClose} hitSlop={8}><Text style={styles.close}>✕</Text></Pressable>
        </View>

        {!ov ? <ActivityIndicator color="#9fb0cf" style={{ margin: 20 }} /> : (
          <View style={styles.cards}>
            {cards.map(([label, val]) => (
              <View key={label} style={styles.stat}>
                <Text style={styles.statVal}>{val}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        )}

        {sel && (
          <View style={styles.grant}>
            <Text style={styles.grantWho}>Adjust coins for <Text style={{ color: '#fff' }}>{sel.name}</Text> (now {sel.coins})</Text>
            <View style={styles.grantRow}>
              <TextInput style={styles.amt} value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
                placeholder="amount" placeholderTextColor="#8a98b8" keyboardType="number-pad" inputMode="numeric" />
              <Pressable style={[styles.gbtn, styles.give]} onPress={() => grant(1)} disabled={busy}><Text style={styles.gbtnTxt}>+ Grant</Text></Pressable>
              <Pressable style={[styles.gbtn, styles.take]} onPress={() => grant(-1)} disabled={busy}><Text style={styles.gbtnTxt}>− Deduct</Text></Pressable>
              <Pressable onPress={() => setSel(null)} hitSlop={8}><Text style={styles.cancel}>cancel</Text></Pressable>
            </View>
          </View>
        )}

        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          <View style={[styles.row, styles.rowHead]}>
            <Text style={[styles.cName, styles.dim]}>Player</Text>
            <Text style={[styles.cNum, styles.dim]}>Lv</Text>
            <Text style={[styles.cNum, styles.dim]}>Wins</Text>
            <Text style={[styles.cCoins, styles.dim]}>Coins</Text>
            <Text style={styles.cAct} />
          </View>
          {players == null ? <ActivityIndicator color="#9fb0cf" style={{ margin: 16 }} /> :
            players.map((p) => (
              <View key={p.id} style={styles.row}>
                <Text style={styles.cName} numberOfLines={1}>{p.name}{p.admin ? ' 🛠' : ''}</Text>
                <Text style={styles.cNum}>{p.level}</Text>
                <Text style={styles.cNum}>{p.wins}</Text>
                <Text style={styles.cCoins}>💰 {p.coins}</Text>
                <Pressable style={styles.cAct} onPress={() => { setSel(p); setAmount(''); }}><Text style={styles.adjust}>Adjust</Text></Pressable>
              </View>
            ))}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,7,11,0.82)', alignItems: 'center', justifyContent: 'center', zIndex: 70 },
  card: { width: 560, maxWidth: '95%', maxHeight: '88%', backgroundColor: '#141824', borderWidth: 1, borderColor: '#2a3145', borderRadius: 16, padding: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  title: { color: '#ffd54a', fontSize: 21, fontWeight: '900', flex: 1 },
  refresh: { color: '#86d6ff', fontSize: 13, fontWeight: '800' },
  close: { color: '#8aa0c8', fontSize: 18, fontWeight: '800' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  stat: { backgroundColor: '#1b2030', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, minWidth: 150, flexGrow: 1, alignItems: 'center' },
  statVal: { color: '#fff', fontSize: 24, fontWeight: '900' },
  statLabel: { color: '#8aa0c8', fontSize: 12, fontWeight: '700', marginTop: 2 },
  grant: { backgroundColor: '#1b2030', borderRadius: 12, padding: 12, marginBottom: 12 },
  grantWho: { color: '#cdd6f4', fontSize: 14, marginBottom: 8 },
  grantRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amt: { width: 110, color: '#fff', fontSize: 15, fontWeight: '700', backgroundColor: '#222a3e', borderWidth: 1, borderColor: '#41507a', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, ...(typeof window !== 'undefined' ? ({ outlineStyle: 'none' } as any) : {}) },
  gbtn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 9 },
  give: { backgroundColor: '#1f7a3f' },
  take: { backgroundColor: '#7a2a26' },
  gbtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  cancel: { color: '#8aa0c8', fontSize: 13, fontWeight: '700' },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#20273a' },
  rowHead: { borderBottomColor: '#2a3145' },
  dim: { color: '#8aa0c8', fontWeight: '800', fontSize: 12 },
  cName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '700', paddingRight: 6 },
  cNum: { width: 44, color: '#86d6ff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  cCoins: { width: 92, color: '#ffd54a', fontSize: 14, fontWeight: '800', textAlign: 'right' },
  cAct: { width: 70, alignItems: 'flex-end' },
  adjust: { color: '#86d6ff', fontSize: 13, fontWeight: '800' },
});
