import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, useWindowDimensions, PanResponder, Platform, StyleSheet } from 'react-native';
import { useGame, nameOf } from './state/store';
import { connect, sendAction, sendSpawn, sendDifficulty, sendProfile } from './net/socket';
import GameCanvas, { Camera, TapMark } from './render/GameCanvas';
import { unprojectH, centerOn, terrainHeight, BASE_H } from './render/iso';
import Hud from './ui/Hud';
import QuickChat from './ui/QuickChat';
import Minimap from './ui/Minimap';
import Inspect from './ui/Inspect';
import Menu from './ui/Menu';
import Help from './ui/Help';
import { sfx } from './audio/sfx';

const MIN_SCALE = 2;
const MAX_SCALE = 40;
const DRAG_THRESHOLD = 6; // px of movement before a gesture counts as a pan, not a tap

export default function GameScreen() {
  const { width: winW, height: winH } = useWindowDimensions();
  const started = useGame((s) => s.started);
  const setStarted = useGame((s) => s.setStarted);
  const map = useGame((s) => s.map);
  const snap = useGame((s) => s.snap);
  const playerId = useGame((s) => s.playerId);

  const [camera, setCamera] = useState<Camera>({ scale: 8, tx: 0, ty: 0 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const [tap, setTap] = useState<TapMark | null>(null);
  const [callouts, setCallouts] = useState<{ key: number; text: string }[]>([]);
  const calloutKey = useRef(0);
  const pushCallout = useCallback((text: string) => {
    const key = ++calloutKey.current;
    setCallouts((cs) => [...cs, { key, text }].slice(-3));
    setTimeout(() => setCallouts((cs) => cs.filter((c) => c.key !== key)), 3500);
  }, []);
  const spectating = useGame((s) => s.spectating);
  const tapTimer = useRef<any>(null);
  const centeredCapital = useRef<number>(-1);
  const containerRef = useRef<any>(null);

  // Spawn mode: in play, connected, but holding no land (fresh join, respawn, or wiped out).
  const myLand = snap && playerId >= 0 ? snap.land[playerId] : 0;
  const spawnMode = started && playerId >= 0 && !!snap && myLand === 0 && snap.winner < 0;
  const myCapital = snap?.capitals?.[playerId] ?? map?.capitals?.[playerId] ?? -1;

  // Fit the whole isometric board on screen when it first loads (so you can see it to pick a spawn).
  const fitted = useRef(false);
  useEffect(() => {
    if (!map || fitted.current) return;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (winW / (map.width + map.height)) * 0.92));
    setCamera(centerOn(map.width / 2, map.height / 2, 0, scale, winW / 2, winH / 2));
    fitted.current = true;
  }, [map, winW, winH]);

  // Zoom in and centre on my capital whenever it changes (i.e. after I spawn).
  useEffect(() => {
    if (!map || myLand <= 0 || myCapital < 0) return;
    if (centeredCapital.current === myCapital) return;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, 11));
    const cx = myCapital % map.width;
    const cy = Math.floor(myCapital / map.width);
    const h = terrainHeight(map.terrain[myCapital] ?? 0);
    setCamera(centerOn(cx, cy, h, scale, winW / 2, winH / 2));
    centeredCapital.current = myCapital;
  }, [map, myCapital, myLand, winW, winH]);

  // Sound cues derived from snapshot deltas (throttled so expansion doesn't chatter).
  const prevLand = useRef<number | null>(null);
  const prevPhase = useRef<number | null>(null);
  const prevAlive = useRef<boolean[] | null>(null);
  const prevCaps = useRef<number[] | null>(null);
  const prevTick = useRef<number | null>(null);
  const lastSfxAt = useRef<number>(0);
  useEffect(() => {
    if (!snap || playerId < 0) return;
    const { muted } = useGame.getState();
    // New match (tick reset): drop all baselines so we don't fire phantom losses/eliminations/
    // capital-falls against the previous match's state.
    if (prevTick.current != null && snap.tick < prevTick.current) {
      prevLand.current = null; prevPhase.current = null; prevAlive.current = null; prevCaps.current = null;
      fitted.current = false; centeredCapital.current = -1;   // re-fit the camera for the new (maybe resized) map
    }
    prevTick.current = snap.tick;
    const land = snap.land[playerId] ?? 0;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (prevLand.current != null && prevLand.current - land >= 1) {
      useGame.getState().flagUnderAttack();                       // losing land -> threat cue
      if (!muted && now - lastSfxAt.current > 320) { sfx.loss(); lastSfxAt.current = now; }
    } else if (!muted && prevLand.current != null && land - prevLand.current >= 1 && now - lastSfxAt.current > 320) {
      sfx.capture(); lastSfxAt.current = now;
    }
    prevLand.current = land;

    if (!muted && prevPhase.current != null && prevPhase.current !== snap.phase) {
      if (snap.phase === 1) sfx.war();
    }
    prevPhase.current = snap.phase;

    if (!muted && snap.winner >= 0 && (snap.winner === playerId || snap.rel?.[playerId]?.[snap.winner] === 2)) {
      if (now - lastSfxAt.current > 1000) { sfx.win(); lastSfxAt.current = now; }
    }

    // Eliminations + capitals falling -> dramatic callouts.
    const pa = prevAlive.current;
    if (pa) for (let p = 0; p < snap.alive.length; p++) {
      if (pa[p] && !snap.alive[p] && (snap.peakLand?.[p] ?? 0) > 0) {
        pushCallout(`${nameOf(snap, p, playerId)} was eliminated`);
        if (!muted) sfx.eliminate();
      }
    }
    prevAlive.current = snap.alive.slice();
    const pc = prevCaps.current;
    if (pc) for (let p = 0; p < snap.alive.length; p++) {
      const old = pc[p];
      if (snap.alive[p] && old != null && old >= 0 && snap.owner[old] !== p && snap.owner[old] !== -2) {
        pushCallout(`${nameOf(snap, p, playerId)}'s capital fell!`);
        if (!muted) sfx.capitalFell();
      }
    }
    prevCaps.current = (snap.capitals ?? []).slice();

    // Clear the standing-order indicator once its target is eliminated (server already stopped it).
    const ord = useGame.getState().order;
    if (ord != null && ord >= 0 && !snap.alive[ord]) useGame.getState().setOrder(null);
  }, [snap, playerId]);

  // Show the How-to-play overlay on a player's first ever game.
  useEffect(() => {
    if (!started) return;
    try {
      if (!localStorage.getItem('territorial_help_seen')) {
        useGame.getState().setShowHelp(true);
        localStorage.setItem('territorial_help_seen', '1');
      }
    } catch { /* ignore */ }
  }, [started]);

  // Ambient war-drone while playing (respects mute).
  const muted = useGame((s) => s.muted);
  useEffect(() => {
    if (!started || muted) { sfx.ambientStop(); return; }
    sfx.ambientStart();
    return () => sfx.ambientStop();
  }, [started, muted]);

  const showTap = useCallback((x: number, y: number, kind: TapMark['kind']) => {
    setTap({ x, y, kind });
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setTap(null), 500);
  }, []);

  const handleTap = useCallback((screenX: number, screenY: number) => {
    const st = useGame.getState();
    const m = st.map;
    const s = st.snap;
    const pid = st.playerId;
    const cam = cameraRef.current;
    if (!m || !s) return;
    const heightOf = (x: number, y: number) =>
      (x < 0 || y < 0 || x >= m.width || y >= m.height) ? BASE_H : terrainHeight(m.terrain[y * m.width + x] ?? 0);
    const u = unprojectH(screenX, screenY, cam, heightOf);
    const cx = Math.floor(u.x);
    const cy = Math.floor(u.y);
    if (cx < 0 || cy < 0 || cx >= m.width || cy >= m.height) return;
    const cell = cy * m.width + cx;
    const target = s.owner[cell];
    if (target === -2) return;              // water is not interactable
    if (target >= 0) useGame.getState().setSelected(target);  // tap a nation -> inspect it

    const inSpawn = pid >= 0 && s.land[pid] === 0 && s.winner < 0;
    if (inSpawn) {
      if (st.spectating) return;            // watching, not playing — tap Respawn to re-enter
      if (target === -1) { showTap(screenX, screenY, 'spawn'); sendSpawn(cell); } // must choose empty land
      return;
    }
    if (st.mode === 'hold') return;         // defensive: ignore taps
    if (target === pid) return;             // can't attack yourself

    if (target === -1) {                    // empty land -> expand
      showTap(screenX, screenY, 'expand');
      sendAction(-1, st.fraction, cell);
      return;
    }
    // enemy land -> attack (the standing order keeps the army flowing there)
    showTap(screenX, screenY, 'attack');
    sendAction(target, st.fraction, cell);
    if (!st.muted) sfx.attack();
  }, [showTap]);

  const lastPan = useRef<{ x: number; y: number } | null>(null);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { lastPan.current = null; },
      onMoveShouldSetPanResponder: (_e, g) => Math.hypot(g.dx, g.dy) > DRAG_THRESHOLD,
      onPanResponderMove: (_e, g) => {
        const prev = lastPan.current ?? { x: 0, y: 0 };
        const ddx = g.dx - prev.x;
        const ddy = g.dy - prev.y;
        lastPan.current = { x: g.dx, y: g.dy };
        setCamera((c) => ({ ...c, tx: c.tx + ddx, ty: c.ty + ddy }));
      },
      onPanResponderRelease: (e, g) => {
        if (Math.hypot(g.dx, g.dy) <= DRAG_THRESHOLD) {
          handleTap(e.nativeEvent.locationX, e.nativeEvent.locationY);
        }
        lastPan.current = null;
      },
    }),
  ).current;

  // Wheel zoom (web only), centred on the cursor.
  useEffect(() => {
    if (Platform.OS !== 'web' || !started) return;
    const node: HTMLElement | null = containerRef.current;
    if (!node || !node.addEventListener) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = node.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      setCamera((c) => {
        const factor = Math.exp(-ev.deltaY * 0.0015);
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, c.scale * factor));
        const k = next / c.scale;
        return { scale: next, tx: mx - (mx - c.tx) * k, ty: my - (my - c.ty) * k };
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [started]);

  // Keyboard navigation (web): arrows / WASD pan, +/- zoom (about screen centre).
  useEffect(() => {
    if (Platform.OS !== 'web' || !started) return;
    const onKey = (e: KeyboardEvent) => {
      const PAN = 70;
      let dx = 0, dy = 0, zoom = 1;
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A': dx = PAN; break;
        case 'ArrowRight': case 'd': case 'D': dx = -PAN; break;
        case 'ArrowUp': case 'w': case 'W': dy = PAN; break;
        case 'ArrowDown': case 's': case 'S': dy = -PAN; break;
        case '+': case '=': zoom = 1.15; break;
        case '-': case '_': zoom = 1 / 1.15; break;
        default: return;
      }
      e.preventDefault();
      setCamera((c) => {
        if (zoom !== 1) {
          const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, c.scale * zoom));
          const k = next / c.scale, mx = winW / 2, my = winH / 2;
          return { scale: next, tx: mx - (mx - c.tx) * k, ty: my - (my - c.ty) * k };
        }
        return { ...c, tx: c.tx + dx, ty: c.ty + dy };
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, winW, winH]);

  // Jump the camera to a map cell (used by minimap clicks).
  const jumpTo = useCallback((mapX: number, mapY: number) => {
    const c = cameraRef.current;
    setCamera(centerOn(mapX, mapY, 0, c.scale, winW / 2, winH / 2));
  }, [winW, winH]);

  if (!started) {
    return <Menu onPlay={(difficulty, name, color) => {
      useGame.getState().setProfile(name, color);
      setStarted(true); connect();
      setTimeout(() => { sendDifficulty(difficulty); sendProfile(name, color); }, 600);
    }} />;
  }

  return (
    <View ref={containerRef} style={styles.root} {...panResponder.panHandlers}>
      {map && snap ? (
        <GameCanvas map={map} snap={snap} camera={camera} screenW={winW} screenH={winH} tap={tap} myId={playerId} />
      ) : (
        <Text style={styles.waiting}>joining match…</Text>
      )}
      {spawnMode && !spectating && (
        <View style={styles.spawnBanner} pointerEvents="box-none">
          <Text style={styles.spawnTitle}>Choose your spawn</Text>
          <Text style={styles.spawnSub}>tap an empty (light) area of the map</Text>
          <Pressable style={styles.spectateBtn} onPress={() => useGame.getState().setSpectating(true)}>
            <Text style={styles.spectateTxt}>👁  Spectate instead</Text>
          </Pressable>
        </View>
      )}
      {spawnMode && spectating && (
        <View style={styles.spectateBar} pointerEvents="box-none">
          <Text style={styles.spectateLabel}>👁  Spectating</Text>
          <Pressable style={styles.respawnBtn} onPress={() => useGame.getState().setSpectating(false)}>
            <Text style={styles.spectateTxt}>↩  Respawn</Text>
          </Pressable>
        </View>
      )}
      {callouts.length > 0 && (
        <View style={styles.callouts} pointerEvents="none">
          {callouts.map((c) => <Text key={c.key} style={styles.callout}>{c.text}</Text>)}
        </View>
      )}
      <Hud />
      <QuickChat />
      <Inspect />
      {map && snap && <Minimap camera={camera} screenW={winW} screenH={winH} onJump={jumpTo} />}
      <Pressable style={styles.helpBtn} onPress={() => useGame.getState().setShowHelp(true)}>
        <Text style={styles.helpTxt}>?</Text>
      </Pressable>
      <Help />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d12', alignItems: 'center', justifyContent: 'center' },
  waiting: { color: '#bbb', fontSize: 16 },
  spawnBanner: {
    position: 'absolute', top: '42%', alignSelf: 'center', alignItems: 'center',
    backgroundColor: 'rgba(20,20,28,0.85)', paddingVertical: 14, paddingHorizontal: 26, borderRadius: 14,
  },
  spawnTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  spawnSub: { color: '#bcd', fontSize: 14, marginTop: 4 },
  spectateBtn: { marginTop: 12, backgroundColor: '#2a3145', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 10 },
  spectateTxt: { color: '#cdd6f4', fontSize: 14, fontWeight: '700' },
  spectateBar: {
    position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(20,20,28,0.85)', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12,
  },
  spectateLabel: { color: '#cdd6f4', fontSize: 15, fontWeight: '800' },
  respawnBtn: { backgroundColor: '#4c7dff', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 9 },
  callouts: { position: 'absolute', top: '22%', alignSelf: 'center', alignItems: 'center', gap: 4 },
  callout: {
    color: '#ffe08a', fontSize: 16, fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  helpBtn: {
    position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(20,24,36,0.92)', borderWidth: 1, borderColor: '#2a3145',
    alignItems: 'center', justifyContent: 'center',
  },
  helpTxt: { color: '#8aa0c8', fontSize: 19, fontWeight: '900' },
});
