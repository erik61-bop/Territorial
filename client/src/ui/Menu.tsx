import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Platform } from 'react-native';
import { PLAYER_COLORS } from '../render/colors';
import { useGame } from '../state/store';
import { refreshMe, logout, claimDaily } from '../net/socket';
import Backdrop from './Backdrop';
import Leaderboard from './Leaderboard';

const MODES = [
  { v: true, label: '🤖 Single-player', sub: 'you vs bots, private' },
  { v: false, label: '🌐 Multiplayer', sub: 'shared room with others' },
];

// Wager tiers for prize rooms (0 = free). The winner takes the whole pot.
const STAKES = [0, 100, 500, 1000];

const LEVELS = [
  { v: 0, label: 'Easy' },
  { v: 1, label: 'Normal' },
  { v: 2, label: 'Hard' },
];

const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;

export default function Menu({ onPlay }: { onPlay: (difficulty: number, name: string, color: number) => void }) {
  const account = useGame((s) => s.account);
  const [diff, setDiff] = useState(1);
  const [name, setName] = useState('');
  const [color, setColor] = useState(0);
  const coins = account?.coins ?? null;
  const singlePlayer = useGame((s) => s.singlePlayer);
  const setSinglePlayer = useGame((s) => s.setSinglePlayer);
  const prizeStake = useGame((s) => s.prizeStake);
  const setPrizeStake = useGame((s) => s.setPrizeStake);
  const joinError = useGame((s) => s.joinError);

  const [daily, setDaily] = useState(0);     // coins granted by today's bonus (toast)
  const [showLb, setShowLb] = useState(false);

  // On landing in the menu: refresh stats, then auto-claim the daily bonus (toast if granted).
  useEffect(() => {
    refreshMe().then(() => claimDaily().then((g) => { if (g > 0) { setDaily(g); setTimeout(() => setDaily(0), 4000); } }));
  }, []);
  // Default the in-game display name to the account name.
  useEffect(() => { if (account?.displayName && !name) setName(account.displayName); }, [account?.displayName]);

  const lvl = account?.level ?? 1;
  const xp = account?.xp ?? 0;
  const xpInto = xp - Math.max(0, ((lvl - 1) * (lvl - 1)) * 100);     // xp within current level
  const xpSpan = Math.max(1, (account?.nextLevelXp ?? 100) - ((lvl - 1) * (lvl - 1)) * 100);
  const xpPct = Math.max(0, Math.min(100, Math.round((xpInto / xpSpan) * 100)));

  // Switching to single-player clears any wager (prize rooms are multiplayer only).
  const pickMode = (v: boolean) => { setSinglePlayer(v); if (v) setPrizeStake(0); };

  return (
    <View style={styles.root}>
      <Backdrop />
      <Text style={styles.title}>TERRITORIAL</Text>
      <Text style={styles.subtitle}>The Art of Conquest — one army is your sword and your shield.</Text>

      <View style={styles.acctRow}>
        <Text style={styles.wallet}>🪙 {coins == null ? '…' : coins}</Text>
        {account && <Text style={styles.acctName}>· {account.displayName}</Text>}
        <Pressable onPress={logout} hitSlop={8}><Text style={styles.logout}>Sign out</Text></Pressable>
      </View>

      <View style={styles.statRow}>
        <Text style={styles.lvlBadge}>Lv {lvl}</Text>
        <View style={styles.xpTrack}><View style={[styles.xpFill, { width: `${xpPct}%` }]} /></View>
        <Text style={styles.statTxt}>🏆 {account?.wins ?? 0}</Text>
        <Pressable onPress={() => setShowLb(true)} hitSlop={8}><Text style={styles.lbLink}>Leaderboard ›</Text></Pressable>
      </View>

      {daily > 0 && <Text style={styles.dailyToast}>🎁 Daily bonus: +{daily} coins!</Text>}

      <Text style={styles.diffLabel}>Mode</Text>
      <View style={styles.modeRow}>
        {MODES.map((m) => (
          <Pressable key={m.label} onPress={() => pickMode(m.v)}
            style={[styles.modeBtn, singlePlayer === m.v && styles.modeActive]}>
            <Text style={[styles.modeTxt, singlePlayer === m.v && { color: '#fff' }]}>{m.label}</Text>
            <Text style={[styles.modeSub, singlePlayer === m.v && { color: '#dbe6ff' }]}>{m.sub}</Text>
          </Pressable>
        ))}
      </View>

      {!singlePlayer && (
        <>
          <Text style={styles.diffLabel}>Wager — winner takes the pot</Text>
          <View style={styles.diffRow}>
            {STAKES.map((s) => {
              const broke = s > 0 && coins != null && coins < s;
              const active = prizeStake === s;
              return (
                <Pressable key={s} disabled={broke} onPress={() => setPrizeStake(s)}
                  style={[styles.stakeBtn, active && styles.modeActive, broke && styles.stakeBroke]}>
                  <Text style={[styles.diffTxt, active && styles.diffTxtActive, broke && { color: '#5a6378' }]}>
                    {s === 0 ? 'Free' : `🪙 ${s}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {prizeStake > 0 && <Text style={styles.stakeNote}>Ante {prizeStake} on join · last one standing wins the whole pot.</Text>}
        </>
      )}
      {joinError && <Text style={styles.joinErr}>⚠ {joinError}</Text>}

      <Text style={styles.diffLabel}>Your name</Text>
      <TextInput
        style={styles.nameInput}
        value={name}
        onChangeText={(t) => setName(t.slice(0, 16))}
        placeholder="Commander"
        placeholderTextColor="#8a98b8"
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
      {showLb && <Leaderboard onClose={() => setShowLb(false)} me={account?.displayName} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d14', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 58, fontWeight: '900', letterSpacing: 5, textShadowColor: 'rgba(90,150,255,0.85)', textShadowRadius: 24 },
  subtitle: { color: '#9aa', fontSize: 15, marginTop: 8, marginBottom: 22, textAlign: 'center' },
  diffLabel: { color: '#8aa0c8', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  modeBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 11, backgroundColor: '#222838', borderWidth: 1, borderColor: '#2a3145', alignItems: 'center' },
  modeActive: { backgroundColor: '#2f6df0', borderColor: '#2f6df0' },
  modeTxt: { color: '#cfe0ff', fontSize: 15, fontWeight: '800' },
  modeSub: { color: '#8aa0c8', fontSize: 11, marginTop: 2 },
  nameInput: {
    width: 260, color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center',
    backgroundColor: '#222a3e', borderWidth: 1, borderColor: '#41507a', borderRadius: 10,
    paddingVertical: 11, marginBottom: 20,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 320, marginBottom: 22 },
  swatch: { width: 30, height: 30, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: '#fff' },
  acctRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18,
    backgroundColor: 'rgba(20,24,36,0.6)', borderWidth: 1, borderColor: '#2a3145', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 },
  wallet: { color: '#ffd54a', fontSize: 16, fontWeight: '800' },
  acctName: { color: '#cdd6f4', fontSize: 14, fontWeight: '700' },
  logout: { color: '#8aa0c8', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline', marginLeft: 4 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  lvlBadge: { color: '#fff', fontSize: 13, fontWeight: '900', backgroundColor: '#2f6df0', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 8, overflow: 'hidden' },
  xpTrack: { width: 120, height: 8, borderRadius: 4, backgroundColor: '#222838', overflow: 'hidden' },
  xpFill: { height: 8, borderRadius: 4, backgroundColor: '#7CFC9B' },
  statTxt: { color: '#cdd6f4', fontSize: 14, fontWeight: '800' },
  lbLink: { color: '#ffd54a', fontSize: 13, fontWeight: '800' },
  dailyToast: { color: '#0b0d14', backgroundColor: '#ffd54a', fontSize: 14, fontWeight: '900', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 999, marginBottom: 14, overflow: 'hidden' },
  stakeBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#222838', borderWidth: 1, borderColor: '#2a3145' },
  stakeBroke: { opacity: 0.45 },
  stakeNote: { color: '#8aa0c8', fontSize: 12, marginBottom: 20, marginTop: -6, textAlign: 'center' },
  joinErr: { color: '#ff9f8f', fontSize: 13, fontWeight: '700', marginBottom: 14, textAlign: 'center' },
  diffRow: { flexDirection: 'row', gap: 8, marginBottom: 26 },
  diffBtn: { paddingVertical: 8, paddingHorizontal: 22, borderRadius: 10, backgroundColor: '#222838', borderWidth: 1, borderColor: '#2a3145' },
  diffActive: { backgroundColor: '#2f6df0', borderColor: '#2f6df0' },
  diffTxt: { color: '#9fb0cf', fontSize: 14, fontWeight: '700' },
  diffTxtActive: { color: '#fff' },
  play: {
    backgroundColor: '#4c7dff', paddingVertical: 15, paddingHorizontal: 56, borderRadius: 16,
    shadowColor: '#4c7dff', shadowOpacity: 0.7, shadowRadius: 22, shadowOffset: { width: 0, height: 6 },
    borderWidth: 1, borderColor: '#6f98ff',
  },
  playTxt: { color: '#fff', fontSize: 23, fontWeight: '900', letterSpacing: 1 },
  hint: { color: '#667', fontSize: 13, marginTop: 28, maxWidth: 440, textAlign: 'center', lineHeight: 19 },
});
