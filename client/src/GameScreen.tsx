import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, useWindowDimensions, PanResponder, Platform, StyleSheet } from 'react-native';
import { useGame } from './state/store';
import { connect, sendAction, sendSpawn } from './net/socket';
import GameCanvas, { Camera, TapMark } from './render/GameCanvas';
import Hud from './ui/Hud';
import Chat from './ui/Chat';
import Menu from './ui/Menu';

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

  // Center on my capital whenever it changes (i.e. after I spawn).
  useEffect(() => {
    if (!map || myLand <= 0 || myCapital < 0) return;
    if (centeredCapital.current === myCapital) return;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.floor(Math.min(winW / map.width, winH / map.height)) || 8));
    const cx = myCapital % map.width;
    const cy = Math.floor(myCapital / map.width);
    setCamera({ scale, tx: winW / 2 - (cx + 0.5) * scale, ty: winH / 2 - (cy + 0.5) * scale });
    centeredCapital.current = myCapital;
  }, [map, myCapital, myLand, winW, winH]);

  const showTap = useCallback((x: number, y: number) => {
    setTap({ x, y });
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
    const cx = Math.floor((screenX - cam.tx) / cam.scale);
    const cy = Math.floor((screenY - cam.ty) / cam.scale);
    if (cx < 0 || cy < 0 || cx >= m.width || cy >= m.height) return;
    const cell = cy * m.width + cx;
    const target = s.owner[cell];
    showTap(screenX, screenY);

    const inSpawn = pid >= 0 && s.land[pid] === 0 && s.winner < 0;
    if (inSpawn) {
      if (target === -1) sendSpawn(cell);   // must choose empty land
      return;
    }
    if (target === pid) return;             // can't attack yourself
    sendAction(target, st.fraction);        // target -1 => expand into neutral
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
    return <Menu onPlay={() => { setStarted(true); connect(); }} />;
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
      <Chat />
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
