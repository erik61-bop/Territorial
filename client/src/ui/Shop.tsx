import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { fetchShop, buyCosmetic, equipCosmetic, ShopItem } from '../net/socket';
import { useGame } from '../state/store';

export default function Shop({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [equipped, setEquipped] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const coins = useGame((s) => s.account?.coins ?? 0);

  const load = useCallback(() => { fetchShop().then((s) => { setItems(s.items); setEquipped(s.equipped); }); }, []);
  useEffect(() => { load(); }, [load]);

  const buy = async (it: ShopItem) => {
    setBusy(it.id); setMsg(null);
    const res = await buyCosmetic(it.id);
    setBusy(null);
    if (res === 'OK') { setMsg(`Unlocked ${it.emoji} ${it.name}!`); await equip(it.id); load(); }
    else if (res === 'TOO_POOR') setMsg('Not enough coins — win some matches!');
    else setMsg(res.replace(/_/g, ' ').toLowerCase());
  };
  const equip = async (id: string) => { await equipCosmetic(id); setEquipped(id ? (items?.find((i) => i.id === id)?.emoji ?? '') : ''); };

  return (
    <Pressable style={styles.scrim} onPress={onClose}>
      <Pressable style={styles.card} onPress={() => {}}>
        <View style={styles.head}>
          <Text style={styles.title}>✨ Emblem shop</Text>
          <Text style={styles.coins}>🪙 {coins}</Text>
          <Pressable onPress={onClose} hitSlop={8}><Text style={styles.close}>✕</Text></Pressable>
        </View>
        <Text style={styles.sub}>Show your flair — your emblem appears by your name in-game and on the leaderboard.</Text>
        {msg && <Text style={styles.msg}>{msg}</Text>}

        {items == null ? <ActivityIndicator color="#9fb0cf" style={{ margin: 28 }} /> : (
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {items.map((it) => {
              const isEq = equipped === it.emoji;
              const broke = !it.owned && coins < it.price;
              return (
                <View key={it.id} style={[styles.tile, isEq && styles.tileEq]}>
                  <Text style={styles.emoji}>{it.emoji}</Text>
                  <Text style={styles.name} numberOfLines={1}>{it.name}</Text>
                  {it.owned ? (
                    <Pressable style={[styles.act, isEq ? styles.equipped : styles.equip]}
                      onPress={() => (isEq ? equip('') : equip(it.id))} disabled={busy === it.id}>
                      <Text style={styles.actTxt}>{isEq ? '✓ Equipped' : 'Equip'}</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={[styles.act, broke ? styles.broke : styles.buy]} onPress={() => buy(it)} disabled={broke || busy === it.id}>
                      <Text style={styles.actTxt}>{busy === it.id ? '…' : `🪙 ${it.price}`}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
        <Pressable style={styles.done} onPress={onClose}><Text style={styles.doneTxt}>Done</Text></Pressable>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,7,11,0.82)', alignItems: 'center', justifyContent: 'center', zIndex: 65 },
  card: { width: 520, maxWidth: '94%', maxHeight: '86%', backgroundColor: '#141824', borderWidth: 1, borderColor: '#2a3145', borderRadius: 16, padding: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  title: { color: '#ffd54a', fontSize: 22, fontWeight: '900', flex: 1 },
  coins: { color: '#ffd54a', fontSize: 16, fontWeight: '800' },
  close: { color: '#8aa0c8', fontSize: 18, fontWeight: '800' },
  sub: { color: '#9fb0cf', fontSize: 13, marginBottom: 8 },
  msg: { color: '#8affb0', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingVertical: 6 },
  tile: { width: 110, backgroundColor: '#1b2030', borderRadius: 12, borderWidth: 1, borderColor: '#2a3145', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6 },
  tileEq: { borderColor: '#ffd54a' },
  emoji: { fontSize: 34 },
  name: { color: '#cdd6f4', fontSize: 12, fontWeight: '700', marginTop: 4, marginBottom: 8 },
  act: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, minWidth: 76, alignItems: 'center' },
  buy: { backgroundColor: '#2f6df0' },
  broke: { backgroundColor: '#2a3145', opacity: 0.6 },
  equip: { backgroundColor: '#1f7a3f' },
  equipped: { backgroundColor: '#7a6a1f' },
  actTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  done: { marginTop: 14, backgroundColor: '#2f6df0', paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  doneTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
