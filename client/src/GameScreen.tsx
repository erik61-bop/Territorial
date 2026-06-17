import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, useWindowDimensions, PanResponder, Platform, StyleSheet } from 'react-native';
import { useGame } from './state/store';
import { connect, sendAction } from './net/socket';
import GameCanvas, { Camera, TapMark } from './render/GameCanvas';
import Hud from './ui/Hud';

const MIN_SCALE = 2;
const MAX_SCALE = 40;
const DRAG_THRESHOLD = 6; // px of movement before a gesture counts as a pan, not a tap

export default function GameScreen() {
  const { width: winW, height: winH } = useWindowDimensions();
  const map = useGame((s) => s.map);
  const snap = useGame((s) => s.snap);
  const playerId = useGame((s) => s.playerId);
  const fraction = useGame((s) => s.fraction);

  const [camera, setCamera] = useState<Camera>({ scale: 8, tx: 0, ty: 0 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const [tap, setTap] = useState<TapMark | null>(null);
  const tapTimer = useRef<any>(null);
  const centeredFor = useRef<number>(-1);
  const containerRef = useRef<any>(null);

  useEffect(() => { connect(); }, []);

  // Auto-center the camera on my capital once, when I first learn who I am.
  useEffect(() => {
    if (!map || playerId < 0) return;
    if (centeredFor.current === playerId) return;
    const cap = map.capitals[playerId];
    if (cap == null || cap < 0) return;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.floor(Math.min(winW / map.width, winH / map.height)) || 8));
    const cx = cap % map.width;
    const cy = Math.floor(cap / map.width);
    setCamera({ scale, tx: winW / 2 - (cx + 0.5) * scale, ty: winH / 2 - (cy + 0.5) * scale });
    centeredFor.current = playerId;
  }, [map, playerId, winW, winH]);

  const showTap = useCallback((x: number, y: number) => {
    setTap({ x, y });
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setTap(null), 500);
  }, []);

  const handleTap = useCallback((screenX: number, screenY: number) => {
    const m = useGame.getState().map;
    const s = useGame.getState().snap;
    const pid = useGame.getState().playerId;
    const cam = cameraRef.current;
    if (!m || !s) return;
    const cx = Math.floor((screenX - cam.tx) / cam.scale);
    const cy = Math.floor((screenY - cam.ty) / cam.scale);
    if (cx < 0 || cy < 0 || cx >= m.width || cy >= m.height) return;
    const target = s.owner[cy * m.width + cx];
    showTap(screenX, screenY);
    if (target === pid) return;                 // can't attack yourself
    sendAction(target, useGame.getState().fraction); // target -1 => expand into neutral
  }, [showTap]);

  // Pan with mouse/finger; a near-stationary press is a tap. PanResponder dx is cumulative,
  // so we track deltas ourselves for smooth panning.
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
    if (Platform.OS !== 'web') return;
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
  }, []);

  return (
    <View ref={containerRef} style={styles.root} {...panResponder.panHandlers}>
      {map && snap ? (
        <GameCanvas map={map} snap={snap} camera={camera} screenW={winW} screenH={winH} tap={tap} myId={playerId} />
      ) : (
        <Text style={styles.waiting}>connecting to server…</Text>
      )}
      <Hud />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d12', alignItems: 'center', justifyContent: 'center' },
  waiting: { color: '#bbb', fontSize: 16 },
});
