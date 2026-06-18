import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, useWindowDimensions, PanResponder, Platform, StyleSheet } from 'react-native';
import { useGame } from './state/store';
import { connect, sendAction, sendSpawn, sendDifficulty, sendProfile } from './net/socket';
import GameCanvas, { Camera, TapMark } from './render/GameCanvas';
import { unproject, centerOn, terrainHeight } from './render/iso';
import Hud from './ui/Hud';
import QuickChat from './ui/QuickChat';
import Minimap from './ui/Minimap';
import Inspect from './ui/Inspect';
import Menu from './ui/Menu';
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
  const lastSfxAt = useRef<number>(0);
  useEffect(() => {
    if (!snap || playerId < 0) return;
    const { muted } = useGame.getState();
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
      if (snap.phase === 2) sfx.finalWar();
      else if (snap.phase === 1) sfx.war();
    }
    prevPhase.current = snap.phase;

    if (!muted && snap.winner >= 0 && (snap.winner === playerId || snap.rel?.[playerId]?.[snap.winner] === 2)) {
      if (now - lastSfxAt.current > 1000) { sfx.win(); lastSfxAt.current = now; }
    }

    // Clear the standing-order indicator once its target is eliminated (server already stopped it).
    const ord = useGame.getState().order;
    if (ord != null && ord >= 0 && !snap.alive[ord]) useGame.getState().setOrder(null);
  }, [snap, playerId]);

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
    const u = unproject(screenX, screenY, cam);
    const cx = Math.floor(u.x);
    const cy = Math.floor(u.y);
    if (cx < 0 || cy < 0 || cx >= m.width || cy >= m.height) return;
    const cell = cy * m.width + cx;
    const target = s.owner[cell];
    if (target === -2) return;              // water is not interactable
    if (target >= 0) useGame.getState().setSelected(target);  // tap a nation -> inspect it

    const inSpawn = pid >= 0 && s.land[pid] === 0 && s.winner < 0;
    if (inSpawn) {
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
      {spawnMode && (
        <View style={styles.spawnBanner} pointerEvents="none">
          <Text style={styles.spawnTitle}>Choose your spawn</Text>
          <Text style={styles.spawnSub}>tap an empty (light) area of the map</Text>
        </View>
      )}
      <Hud />
      <QuickChat />
      <Inspect />
      {map && snap && <Minimap camera={camera} screenW={winW} screenH={winH} />}
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
});
