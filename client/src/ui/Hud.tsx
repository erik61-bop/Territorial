import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame, Mode, nameOf, colorIndexOf, defenseOf, defenseAvgOf, defenseTag, isHolding } from '../state/store';
import { cssPlayer, TERRAIN_INFO, TERRAIN_COLORS } from '../render/colors';
import Slider from './Slider';
import { sendStop } from '../net/socket';

const terrainCss = (i: number) => `rgb(${TERRAIN_COLORS[i][0]},${TERRAIN_COLORS[i][1]},${TERRAIN_COLORS[i][2]})`;
const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.max(0, secs % 60)).padStart(2, '0')}`;

const PHASES = [
  { name: 'PEACE PERIOD', color: '#7CFC9B', next: 'War' },
  { name: 'WAR PERIOD', color: '#FFD166', next: '' },
  { name: 'FINAL WAR', color: '#FF6B6B', next: '' },
];

const ACTIONS: { mode: Mode; label: string; icon: string; color: string; hint: string; hot: string }[] = [
  { mode: 'attack', label: 'Attack', icon: '⚔️', color: '#e0473e', hint: 'tap empty land to expand, a country to conquer', hot: 'Q' },
  { mode: 'hold', label: 'Hold', icon: '🛡️', color: '#46a35a', hint: 'stop attacking & dig in — +25% defence', hot: 'Space' },
];

// Quick send-% presets (the slider still gives fine control).
const PRESETS: { f: number; label: string }[] = [
  { f: 0.25, label: '25%' }, { f: 0.5, label: '50%' }, { f: 0.75, label: '75%' }, { f: 1.0, label: 'All-in' },
];

export default function Hud() {
  const insets = useSafeAreaInsets();                       // notch / status bar / home indicator
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 480;                                // phone-width: declutter the HUD
  const connected = useGame((s) => s.connected);
  const playerId = useGame((s) => s.playerId);
  const matchId = useGame((s) => s.matchId);
  const singlePlayer = useGame((s) => s.singlePlayer);
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
      <View style={[styles.card, styles.topLeft, { top: 12 + insets.top, left: 12 + insets.left }, narrow && { minWidth: 0 }]}>
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
        <View style={[styles.card, styles.phaseBar, { top: 12 + insets.top }, narrow && { minWidth: 0, paddingHorizontal: 12 }]}>
          <Text style={[styles.phaseName, { color: phase.color }]}>{phase.name}</Text>
          {phaseSecs >= 0 && <Text style={styles.phaseTimer}>{mmss(phaseSecs)}</Text>}
          {phaseSecs >= 0 && phase.next !== '' && <Text style={styles.dim}>{phase.next} starts in {mmss(phaseSecs)}</Text>}
          {snap?.phase === 0 && <Text style={styles.dim}>🌫 fog of war — rivals hidden until war</Text>}
        </View>
      )}

      {/* threat cue */}
      {underAttack && !won && (
        <View style={[styles.card, styles.threat, { top: 92 + insets.top }]} pointerEvents="none">
          <Text style={styles.threatTxt}>⚠ UNDER ATTACK</Text>
        </View>
      )}

      {/* top-right: buttons (left of GameScreen's help/settings cluster) */}
      <View style={[styles.topRight, { top: 12 + insets.top, right: 12 + insets.right }]}>
        <Pressable style={styles.iconBtn} onPress={toggleMuted}><Text style={styles.iconTxt}>{muted ? '🔇' : '🔊'}</Text></Pressable>
      </View>

      {/* left: leaderboard */}
      <View style={[styles.card, styles.leaderboard, { top: 92 + insets.top, left: 12 + insets.left }, narrow && { width: 150 }]}>
        <Text style={styles.cardLabel}>LEADERBOARD</Text>
        {top.map((p, i) => (
          <Row key={p.id} rank={i + 1} id={p.id} land={p.land} me={playerId}
               name={nameOf(snap, p.id, playerId)} color={cssPlayer(colorIndexOf(snap, p.id))} />
        ))}
        {showMine && (
          <>
            <Text style={styles.ellipsis}>…</Text>
            <Row rank={myRank + 1} id={playerId} land={myLand} me={playerId}
                 name={nameOf(snap, playerId, playerId)} color={cssPlayer(colorIndexOf(snap, playerId))} />
          </>
        )}
      </View>

      {/* bottom-left: your status */}
      <View style={[styles.card, styles.status, { bottom: 12 + insets.bottom, left: 12 + insets.left }, narrow && { width: 200 }]}>
        <View style={styles.statusHead}>
          <View style={[styles.shield, { backgroundColor: playerId >= 0 ? cssPlayer(colorIndexOf(snap, playerId)) : '#666' }]} />
          <Text style={styles.statusTitle}>{playerId >= 0 ? (useGame.getState().myName || nameOf(snap, playerId, playerId)) : 'Spectating'}</Text>
          <Text style={styles.matchTag}>{singlePlayer ? 'Solo' : matchId > 0 ? `Match #${matchId}` : ''}</Text>
        </View>
        <Text style={styles.statusLine}>Land <Text style={styles.statusVal}>{myLand}</Text>    Army <Text style={styles.statusVal}>{Math.round(myArmy)}</Text></Text>
        <Text style={styles.statusLine}>Income <Text style={[styles.statusVal, { color: '#7CFC9B' }]}>+{myIncome}/s</Text>    Morale <Text style={[styles.statusVal, { color: moraleColor }]}>{(myMorale / 100).toFixed(2)}</Text></Text>
        {(() => { const weak = defenseOf(snap, playerId); const avg = defenseAvgOf(snap, playerId); const hold = isHolding(snap, playerId); return (
          <Text style={styles.statusLine}>🛡 Defense <Text style={[styles.statusVal, { color: weak < 1 ? '#ff9f8f' : '#86d6ff' }]}>{weak.toFixed(1)}</Text> <Text style={styles.dim}>weakest · avg {avg.toFixed(1)} · {defenseTag(weak)}{hold ? ' · 🛡Hold +25%' : ''}</Text></Text>
        ); })()}
        {order != null && (
          <Text style={styles.orderNote}>↪ You're attacking — your army is being spent, so it won't grow. Press 🛡 Hold to stop & build it up.</Text>
        )}
        {(snap?.developing?.[playerId] ?? 0) > 0 && (
          <Text style={styles.statusLine}>🏗 <Text style={[styles.statusVal, { color: '#ffd07a' }]}>{snap!.developing![playerId]}</Text> <Text style={styles.dim}>cells developing — no income yet</Text></Text>
        )}
        {snap?.isPrize && (
          <Text style={styles.statusLine}>💰 Pot <Text style={[styles.statusVal, { color: '#ffd54a' }]}>{snap.pot ?? 0}</Text> <Text style={styles.dim}>· you {snap.coins?.[playerId] ?? 0}</Text></Text>
        )}
        <View style={styles.barTrack}><View style={[styles.barFill, { width: `${mapPct}%` }]} /></View>
        <Text style={styles.dim}>{mapPct}% of the map</Text>
      </View>

      {/* bottom-centre: action bar + commit slider */}
      <View style={[styles.card, styles.actionBar, { bottom: 12 + insets.bottom }]}>
        <View style={styles.presetRow}>
          {PRESETS.map((pr) => (
            <Pressable key={pr.label} onPress={() => setFraction(pr.f)}
              style={[styles.preset, Math.abs(fraction - pr.f) < 0.02 && styles.presetActive]}>
              <Text style={[styles.presetTxt, Math.abs(fraction - pr.f) < 0.02 && { color: '#fff' }]}>{pr.label}</Text>
            </Pressable>
          ))}
        </View>
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
              style={[styles.action, { borderColor: a.color }, mode === a.mode && { backgroundColor: a.color },
                      order != null && a.mode === 'hold' && styles.holdAttention]}
            >
              <Text style={styles.actionIcon}>{a.icon}</Text>
              <Text style={[styles.actionTxt, mode === a.mode && { color: '#fff' }]}>{a.label}</Text>
              <Text style={[styles.actionKey, mode === a.mode && { color: '#dbe6ff' }]}>{a.hot}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.dim}>
          {order != null
            ? (order === -1 ? '↗ expanding — keeps going (Hold to stop)' : `⚔ attacking ${nameOf(snap, order, playerId)} — keeps going (Hold to stop)`)
            : ACTIONS.find((a) => a.mode === mode)?.hint}
        </Text>
      </View>

      {/* terrain legend — reference only; hidden on phone-width to declutter the play area */}
      {!narrow && (
        <View style={[styles.card, styles.legend, { right: 12 + insets.right, bottom: 212 + insets.bottom }]}>
          {TERRAIN_INFO.map((t, i) => (
            <View key={t.name} style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: terrainCss(i) }]} />
              <Text style={styles.legendTxt}>{t.name}{t.note ? `  ${t.note}` : ''}</Text>
            </View>
          ))}
        </View>
      )}

      {won && (
        <View style={styles.bannerWrap} pointerEvents="none">
          <Text style={styles.banner}>
            {snap!.winner === playerId ? 'You win! 🏆'
              : `${nameOf(snap, snap!.winner, playerId)} wins 🏆`}
          </Text>
          {playerId >= 0 && snap!.place?.[playerId] ? (
            <Text style={styles.summary}>
              You finished #{snap!.place[playerId]} of {snap!.place.filter((x) => x > 0).length}
              {snap!.peakLand?.[playerId] ? `  ·  peak land ${snap!.peakLand[playerId]}` : ''}
            </Text>
          ) : null}
          {snap!.isPrize ? (
            <Text style={styles.prizeWin}>
              {snap!.winner === playerId ? `💰 You won the ${snap!.pot ?? 0} pot!`
                : snap!.human?.[snap!.winner] ? `💰 ${nameOf(snap, snap!.winner, playerId)} took the ${snap!.pot ?? 0} pot`
                : `🤖 A bot won — your ${snap!.stake ?? 0} ante was refunded`}
            </Text>
          ) : null}
          {playerId >= 0 && ((snap!.rewardCoins?.[playerId] ?? 0) > 0 || (snap!.rewardXp?.[playerId] ?? 0) > 0) ? (
            <WinReward coins={snap!.rewardCoins![playerId]} xp={snap!.rewardXp![playerId]} levelUp={!!snap!.leveledUp?.[playerId]} />
          ) : null}
          <Text style={styles.dim}>{snap!.isPrize ? 'leave to play again' : 'new match starting…'}</Text>
        </View>
      )}
    </>
  );
}

/** Animated victory/defeat payoff card: pops in with the coins/XP earned and a LEVEL UP flourish. */
function WinReward({ coins, xp, levelUp }: { coins: number; xp: number; levelUp: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.spring(a, { toValue: 1, useNativeDriver: false, speed: 8, bounciness: 12 }).start();
  }, [a, coins, xp]);
  return (
    <Animated.View style={[styles.reward, {
      opacity: a,
      transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
    }]}>
      {levelUp && <Text style={styles.levelUp}>⬆ LEVEL UP!</Text>}
      <Text style={styles.rewardTxt}>💰 +{coins}   ·   ⭐ +{xp} XP</Text>
    </Animated.View>
  );
}

function Row({ rank, id, land, me, name, color }: { rank: number; id: number; land: number; me: number; name: string; color: string }) {
  return (
    <View style={[styles.lbRow, id === me && styles.lbMine]}>
      <Text style={styles.lbRank}>{rank}</Text>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.lbName} numberOfLines={1}>{name}</Text>
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
  matchTag: { color: '#8aa0c8', fontSize: 11, fontWeight: '700', marginLeft: 'auto' },
  statusLine: { color: '#cdd6f4', fontSize: 13, marginVertical: 1 },
  statusVal: { color: '#fff', fontWeight: '800' },
  presetRow: { flexDirection: 'row', gap: 6, marginBottom: 6, justifyContent: 'center' },
  preset: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#222838', borderWidth: 1, borderColor: '#2a3145' },
  presetActive: { backgroundColor: '#4c7dff', borderColor: '#4c7dff' },
  presetTxt: { color: '#9fb0cf', fontSize: 12, fontWeight: '800' },
  orderNote: { color: '#ffd07a', fontSize: 11, fontWeight: '700', marginTop: 2 },
  holdAttention: { borderColor: '#7CFC9B', backgroundColor: 'rgba(70,163,90,0.30)' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#2a3145', marginTop: 8, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: '#4c7dff' },

  actionBar: { bottom: 12, alignSelf: 'center', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  fracVal: { color: '#fff', fontSize: 13, fontWeight: '800', width: 42, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 8 },
  action: { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 9, borderWidth: 2, backgroundColor: '#1b2030', minWidth: 64 },
  actionIcon: { fontSize: 16 },
  actionTxt: { color: '#cdd6f4', fontSize: 12, fontWeight: '700' },
  actionKey: { color: '#7689ad', fontSize: 9, fontWeight: '800', marginTop: 1 },

  legend: { right: 12, bottom: 212, paddingVertical: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 1 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendTxt: { color: '#cdd6f4', fontSize: 11 },

  dot: { width: 12, height: 12, borderRadius: 6 },
  bannerWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  banner: { color: '#fff', fontSize: 40, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 8 },
  summary: { color: '#ffe08a', fontSize: 18, fontWeight: '800', marginTop: 6, textShadowColor: '#000', textShadowRadius: 6 },
  prizeWin: { color: '#ffd54a', fontSize: 22, fontWeight: '900', marginTop: 8, textShadowColor: '#000', textShadowRadius: 6 },
  reward: { marginTop: 12, backgroundColor: 'rgba(20,24,36,0.92)', borderWidth: 1, borderColor: '#ffd54a', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 22, alignItems: 'center' },
  rewardTxt: { color: '#fff', fontSize: 18, fontWeight: '900' },
  levelUp: { color: '#8affb0', fontSize: 16, fontWeight: '900', marginBottom: 4, letterSpacing: 1 },
});
