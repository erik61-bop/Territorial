import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useGame } from '../state/store';
import { cssPlayer, TERRAIN_INFO, TERRAIN_COLORS } from '../render/colors';
import Slider from './Slider';

const terrainCss = (i: number) => `rgb(${TERRAIN_COLORS[i][0]},${TERRAIN_COLORS[i][1]},${TERRAIN_COLORS[i][2]})`;

export default function Hud() {
  const connected = useGame((s) => s.connected);
  const playerId = useGame((s) => s.playerId);
  const snap = useGame((s) => s.snap);
  const fraction = useGame((s) => s.fraction);
  const setFraction = useGame((s) => s.setFraction);
  const muted = useGame((s) => s.muted);
  const toggleMuted = useGame((s) => s.toggleMuted);

  const leaderboard = React.useMemo(() => {
    if (!snap) return [];
    return snap.land
      .map((land, id) => ({ id, land, army: snap.army[id], alive: snap.alive[id] }))
      .filter((p) => p.alive)
      .sort((a, b) => b.land - a.land)
      .slice(0, 6);
  }, [snap]);

  const myLand = snap && playerId >= 0 ? snap.land[playerId] : 0;
  const myArmy = snap && playerId >= 0 ? snap.army[playerId] : 0;
  const myMorale = snap && playerId >= 0 ? (snap.morale?.[playerId] ?? 100) : 100; // x100
  const moraleColor = myMorale >= 108 ? '#7CFC9B' : myMorale <= 92 ? '#FF6B6B' : '#e8e8e8';
  const moraleArrow = myMorale >= 108 ? '▲' : myMorale <= 92 ? '▼' : '–';
  const won = snap && snap.winner >= 0;

  const PHASES = [
    { label: 'PEACE — expand, no attacks', color: '#7CFC9B', next: 'War' },
    { label: 'WAR', color: '#FFD166', next: 'Final War' },
    { label: 'FINAL WAR — no peace!', color: '#FF6B6B', next: '' },
  ];
  const phase = snap ? PHASES[snap.phase] ?? PHASES[1] : null;
  const secs = snap && snap.phaseEndsIn >= 0 ? Math.ceil(snap.phaseEndsIn / 8) : -1; // 8 ticks/s
  const phaseText = phase
    ? phase.label + (secs >= 0 ? `   ·   ${phase.next} in ${secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : `${secs}s`}` : '')
    : '';

  return (
    <>
      {phase && !won && (
        <View style={[styles.panel, styles.phaseBar]}>
          <Text style={[styles.phaseText, { color: phase.color }]}>{phaseText}</Text>
        </View>
      )}
      {/* top-left: identity + my stats */}
      <View style={[styles.panel, styles.topLeft]}>
        <View style={styles.row}>
          <View style={[styles.swatch, { backgroundColor: playerId >= 0 ? cssPlayer(playerId) : '#666' }]} />
          <Text style={styles.title}>
            {playerId >= 0 ? `You — player ${playerId}` : 'Spectating'}
          </Text>
          <Pressable onPress={toggleMuted} hitSlop={8}>
            <Text style={styles.mute}>{muted ? '🔇' : '🔊'}</Text>
          </Pressable>
        </View>
        <Text style={styles.stat}>army {Math.round(myArmy)}   land {myLand}</Text>
        <Text style={styles.stat}>
          morale <Text style={{ color: moraleColor, fontWeight: '700' }}>{(myMorale / 100).toFixed(2)} {moraleArrow}</Text>
        </Text>
        <Text style={[styles.dim, { color: connected ? '#7CFC9B' : '#FF6B6B' }]}>
          {connected ? 'connected' : 'connecting…'}{snap ? `  ·  tick ${snap.tick}` : ''}
        </Text>
      </View>

      {/* top-right: leaderboard */}
      <View style={[styles.panel, styles.topRight]}>
        <Text style={styles.title}>Leaderboard</Text>
        {leaderboard.map((p) => (
          <View key={p.id} style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: cssPlayer(p.id) }]} />
            <Text style={styles.stat}>
              {p.id === playerId ? 'you' : `P${p.id}`}  ·  {p.land}
            </Text>
          </View>
        ))}
      </View>

      {/* bottom: commit fraction slider */}
      <View style={[styles.panel, styles.bottom]}>
        <Text style={styles.dim}>Tap a country to send <Text style={styles.fracText}>{Math.round(fraction * 100)}%</Text> of your army</Text>
        <Slider value={fraction} onChange={setFraction} width={240} />
      </View>

      {/* terrain legend */}
      <View style={[styles.panel, styles.legend]}>
        {TERRAIN_INFO.map((t, i) => (
          <View key={t.name} style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: terrainCss(i) }]} />
            <Text style={styles.legendTxt}>{t.name}{t.note ? `  ${t.note}` : ''}</Text>
          </View>
        ))}
      </View>

      {won && (() => {
        const w = snap!.winner;
        const onWinningSide = w === playerId || snap!.rel?.[playerId]?.[w] === 2;
        return (
          <View style={styles.bannerWrap} pointerEvents="none">
            <Text style={styles.banner}>
              {w === playerId ? 'You win! 🏆'
                : onWinningSide ? 'Your alliance wins! 🛡️🏆'
                : `Player ${w} wins`}
            </Text>
            <Text style={styles.dim}>new match starting…</Text>
          </View>
        );
      })()}
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    backgroundColor: 'rgba(20,20,28,0.82)',
    padding: 10,
    borderRadius: 10,
  },
  phaseBar: { top: 12, alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 14 },
  phaseText: { fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
  topLeft: { top: 12, left: 12, minWidth: 170 },
  topRight: { top: 12, right: 12, minWidth: 130 },
  bottom: { bottom: 16, alignSelf: 'center', alignItems: 'center' },
  legend: { position: 'absolute', right: 12, bottom: 16, paddingVertical: 8 },
  legendTxt: { color: '#cdd6f4', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 },
  swatch: { width: 14, height: 14, borderRadius: 3 },
  title: { color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 2 },
  mute: { fontSize: 15, marginLeft: 2 },
  stat: { color: '#e8e8e8', fontSize: 13 },
  dim: { color: '#aaa', fontSize: 12 },
  fracBtn: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: '#33384a', marginHorizontal: 4,
  },
  fracBtnActive: { backgroundColor: '#4c7dff' },
  fracText: { color: '#fff', fontWeight: '600' },
  bannerWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  banner: { color: '#fff', fontSize: 40, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 8 },
});
