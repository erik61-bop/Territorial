import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useGame, Mode } from '../state/store';
import { cssPlayer, TERRAIN_INFO, TERRAIN_COLORS } from '../render/colors';
import Slider from './Slider';
import { sendStop } from '../net/socket';

const terrainCss = (i: number) => `rgb(${TERRAIN_COLORS[i][0]},${TERRAIN_COLORS[i][1]},${TERRAIN_COLORS[i][2]})`;
const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.max(0, secs % 60)).padStart(2, '0')}`;

const PHASES = [
  { name: 'PEACE PERIOD', color: '#7CFC9B', next: 'War' },
  { name: 'WAR PERIOD', color: '#FFD166', next: 'Final War' },
  { name: 'FINAL WAR', color: '#FF6B6B', next: '' },
];

const ACTIONS: { mode: Mode; label: string; icon: string; color: string; hint: string }[] = [
  { mode: 'move', label: 'Move', icon: '🏃', color: '#2f6df0', hint: 'expand into empty land' },
  { mode: 'attack', label: 'Attack', icon: '⚔️', color: '#e0473e', hint: 'conquer enemy land' },
  { mode: 'split', label: 'Split', icon: '🔱', color: '#e0a52e', hint: 'send smaller waves to spread' },
  { mode: 'hold', label: 'Hold', icon: '🛡️', color: '#46a35a', hint: 'stay and defend' },
];

export default function Hud() {
  const connected = useGame((s) => s.connected);
  const playerId = useGame((s) => s.playerId);
  const snap = useGame((s) => s.snap);
  const map = useGame((s) => s.map);
  const fraction = useGame((s) => s.fraction);
  const setFraction = useGame((s) => s.setFraction);
  const muted = useGame((s) => s.muted);
  const toggleMuted = useGame((s) => s.toggleMuted);
  const mode = useGame((s) => s.mode);
  const setMode = useGame((s) => s.setMode);
  const order = useGame((s) => s.order);
  const underAttackAt = useGame((s) => s.underAttackAt);
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const underAttack = nowMs - underAttackAt < 1500;

  const aliveCount = snap ? snap.alive.filter(Boolean).length : 0;
  const eliminated = snap ? snap.alive.length - aliveCount : 0;
  const matchSecs = snap ? Math.floor(snap.tick / 8) : 0;

  const leaderboard = React.useMemo(() => {
    if (!snap) return [];
    return snap.land
      .map((land, id) => ({ id, land, alive: snap.alive[id] }))
      .filter((p) => p.alive)
      .sort((a, b) => b.land - a.land);
  }, [snap]);
  const myRank = leaderboard.findIndex((p) => p.id === playerId);
  const top = leaderboard.slice(0, 5);
  const showMine = myRank >= 5;

  const myLand = snap && playerId >= 0 ? snap.land[playerId] : 0;
  const myArmy = snap && playerId >= 0 ? snap.army[playerId] : 0;
  const myIncome = snap && playerId >= 0 ? (snap.income?.[playerId] ?? 0) : 0;
  const myMorale = snap && playerId >= 0 ? (snap.morale?.[playerId] ?? 100) : 100;
  const ownable = map?.ownableCells ?? 1;
  const mapPct = Math.min(100, Math.round((myLand / ownable) * 100));
  const moraleColor = myMorale >= 108 ? '#7CFC9B' : myMorale <= 92 ? '#FF6B6B' : '#cdd6f4';

  const won = snap && snap.winner >= 0;
  const phase = snap ? PHASES[snap.phase] ?? PHASES[1] : null;
  const phaseSecs = snap && snap.phaseEndsIn >= 0 ? Math.ceil(snap.phaseEndsIn / 8) : -1;

  return (
    <>
      {/* top-left: match info */}
      <View style={[styles.card, styles.topLeft]}>
        <Text style={styles.cardLabel}>MATCH</Text>
        <View style={styles.statRow}>
          <Text style={styles.statBig}>👥 {aliveCount}</Text>
          <Text style={styles.statBig}>💀 {eliminated}</Text>
          <Text style={styles.statBig}>⏱ {mmss(matchSecs)}</Text>
        </View>
        <Text style={[styles.dim, { color: connected ? '#7CFC9B' : '#FF6B6B' }]}>
          {connected ? 'connected' : 'connecting…'}
        </Text>
      </View>

      {/* top-centre: phase banner */}
      {phase && !won && (
        <View style={[styles.card, styles.phaseBar]}>
          <Text style={[styles.phaseName, { color: phase.color }]}>{phase.name}</Text>
          {phaseSecs >= 0 && <Text style={styles.phaseTimer}>{mmss(phaseSecs)}</Text>}
          {phaseSecs >= 0 && <Text style={styles.dim}>{phase.next} starts in {mmss(phaseSecs)}</Text>}
        </View>
      )}

      {/* threat cue */}
      {underAttack && !won && (
        <View style={[styles.card, styles.threat]} pointerEvents="none">
          <Text style={styles.threatTxt}>⚠ UNDER ATTACK</Text>
        </View>
      )}

      {/* top-right: buttons */}
      <View style={styles.topRight}>
        <Pressable style={styles.iconBtn} onPress={toggleMuted}><Text style={styles.iconTxt}>{muted ? '🔇' : '🔊'}</Text></Pressable>
      </View>

      {/* left: leaderboard */}
      <View style={[styles.card, styles.leaderboard]}>
        <Text style={styles.cardLabel}>LEADERBOARD</Text>
        {top.map((p, i) => (
          <Row key={p.id} rank={i + 1} id={p.id} land={p.land} me={playerId} />
        ))}
        {showMine && (
          <>
            <Text style={styles.ellipsis}>…</Text>
            <Row rank={myRank + 1} id={playerId} land={myLand} me={playerId} />
          </>
        )}
      </View>

      {/* bottom-left: your status */}
      <View style={[styles.card, styles.status]}>
        <View style={styles.statusHead}>
          <View style={[styles.shield, { backgroundColor: playerId >= 0 ? cssPlayer(playerId) : '#666' }]} />
          <Text style={styles.statusTitle}>{playerId >= 0 ? `You — P${playerId}` : 'Spectating'}</Text>
        </View>
        <Text style={styles.statusLine}>Land <Text style={styles.statusVal}>{myLand}</Text>    Army <Text style={styles.statusVal}>{Math.round(myArmy)}</Text></Text>
        <Text style={styles.statusLine}>Income <Text style={[styles.statusVal, { color: '#7CFC9B' }]}>+{myIncome}/s</Text>    Morale <Text style={[styles.statusVal, { color: moraleColor }]}>{(myMorale / 100).toFixed(2)}</Text></Text>
        <View style={styles.barTrack}><View style={[styles.barFill, { width: `${mapPct}%` }]} /></View>
        <Text style={styles.dim}>{mapPct}% of the map</Text>
      </View>

      {/* bottom-centre: action bar + commit slider */}
      <View style={[styles.card, styles.actionBar]}>
        <View style={styles.sliderRow}>
          <Text style={styles.dim}>send</Text>
          <Slider value={fraction} onChange={setFraction} width={150} />
          <Text style={styles.fracVal}>{Math.round(fraction * 100)}%</Text>
        </View>
        <View style={styles.actions}>
          {ACTIONS.map((a) => (
            <Pressable
              key={a.mode}
              onPress={() => { setMode(a.mode); if (a.mode === 'hold') sendStop(); }}
              style={[styles.action, { borderColor: a.color }, mode === a.mode && { backgroundColor: a.color }]}
            >
              <Text style={styles.actionIcon}>{a.icon}</Text>
              <Text style={[styles.actionTxt, mode === a.mode && { color: '#fff' }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.dim}>
          {order != null
            ? (order === -1 ? '↗ expanding — keeps going (Hold to stop)' : `⚔ attacking P${order} — keeps going (Hold to stop)`)
            : ACTIONS.find((a) => a.mode === mode)?.hint}
        </Text>
      </View>

      {/* terrain legend */}
      <View style={[styles.card, styles.legend]}>
        {TERRAIN_INFO.map((t, i) => (
          <View key={t.name} style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: terrainCss(i) }]} />
            <Text style={styles.legendTxt}>{t.name}{t.note ? `  ${t.note}` : ''}</Text>
          </View>
        ))}
      </View>

      {won && (
        <View style={styles.bannerWrap} pointerEvents="none">
          <Text style={styles.banner}>
            {snap!.winner === playerId ? 'You win! 🏆'
              : snap!.rel?.[playerId]?.[snap!.winner] === 2 ? 'Your alliance wins! 🛡️🏆'
              : `Player ${snap!.winner} wins`}
          </Text>
          <Text style={styles.dim}>new match starting…</Text>
        </View>
      )}
    </>
  );
}

function Row({ rank, id, land, me }: { rank: number; id: number; land: number; me: number }) {
  return (
    <View style={[styles.lbRow, id === me && styles.lbMine]}>
      <Text style={styles.lbRank}>{rank}</Text>
      <View style={[styles.dot, { backgroundColor: cssPlayer(id) }]} />
      <Text style={styles.lbName}>{id === me ? 'You' : `P${id}`}</Text>
      <Text style={styles.lbLand}>{land}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', backgroundColor: 'rgba(15,18,28,0.92)', borderWidth: 1, borderColor: '#2a3145', borderRadius: 12, padding: 10 },
  cardLabel: { color: '#8aa0c8', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  dim: { color: '#8aa0c8', fontSize: 11 },

  topLeft: { top: 12, left: 12, minWidth: 180 },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  statBig: { color: '#fff', fontSize: 15, fontWeight: '700' },

  phaseBar: { top: 12, alignSelf: 'center', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 22, minWidth: 220 },
  threat: { top: 92, alignSelf: 'center', backgroundColor: 'rgba(120,20,20,0.92)', borderColor: '#ff5b5b', paddingVertical: 6, paddingHorizontal: 16 },
  threatTxt: { color: '#ffd1d1', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  phaseName: { fontWeight: '900', fontSize: 16, letterSpacing: 1 },
  phaseTimer: { color: '#fff', fontSize: 26, fontWeight: '900', lineHeight: 30 },

  topRight: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(15,18,28,0.92)', borderWidth: 1, borderColor: '#2a3145', alignItems: 'center', justifyContent: 'center' },
  iconTxt: { fontSize: 18 },

  leaderboard: { top: 92, left: 12, width: 190 },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, gap: 8, borderRadius: 6, paddingHorizontal: 4 },
  lbMine: { backgroundColor: 'rgba(76,125,255,0.22)' },
  lbRank: { color: '#8aa0c8', fontSize: 12, width: 16, fontWeight: '700' },
  lbName: { color: '#e8edf7', fontSize: 13, flex: 1 },
  lbLand: { color: '#fff', fontSize: 13, fontWeight: '700' },
  ellipsis: { color: '#8aa0c8', textAlign: 'center', fontSize: 12 },

  status: { bottom: 12, left: 12, width: 230 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  shield: { width: 20, height: 22, borderRadius: 4 },
  statusTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  statusLine: { color: '#cdd6f4', fontSize: 13, marginVertical: 1 },
  statusVal: { color: '#fff', fontWeight: '800' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#2a3145', marginTop: 8, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: '#4c7dff' },

  actionBar: { bottom: 12, alignSelf: 'center', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  fracVal: { color: '#fff', fontSize: 13, fontWeight: '800', width: 42, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 8 },
  action: { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 9, borderWidth: 2, backgroundColor: '#1b2030', minWidth: 64 },
  actionIcon: { fontSize: 16 },
  actionTxt: { color: '#cdd6f4', fontSize: 12, fontWeight: '700' },

  legend: { right: 12, bottom: 212, paddingVertical: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 1 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendTxt: { color: '#cdd6f4', fontSize: 11 },

  dot: { width: 12, height: 12, borderRadius: 6 },
  bannerWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  banner: { color: '#fff', fontSize: 40, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 8 },
});
