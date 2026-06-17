import React, { useEffect } from 'react';
import { View, Text, useWindowDimensions, GestureResponderEvent, StyleSheet } from 'react-native';
import { useGame } from './state/store';
import { connect, sendAction } from './net/socket';
import GameCanvas from './render/GameCanvas';
import Hud from './ui/Hud';

export default function GameScreen() {
  const { width: winW, height: winH } = useWindowDimensions();
  const map = useGame((s) => s.map);
  const snap = useGame((s) => s.snap);
  const playerId = useGame((s) => s.playerId);
  const fraction = useGame((s) => s.fraction);

  useEffect(() => { connect(); }, []);

  let board: React.ReactNode = (
    <Text style={styles.waiting}>connecting to server…</Text>
  );

  if (map && snap) {
    const scale = Math.max(1, Math.floor(Math.min(winW / map.width, winH / map.height)));
    const drawW = map.width * scale;
    const drawH = map.height * scale;

    const onRelease = (e: GestureResponderEvent) => {
      const { locationX, locationY } = e.nativeEvent;
      const cx = Math.floor(locationX / scale);
      const cy = Math.floor(locationY / scale);
      if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return;
      const target = snap.owner[cy * map.width + cx];
      if (target === playerId) return;        // can't attack yourself
      sendAction(target, fraction);            // target === -1 => expand into neutral
    };

    board = (
      <View
        style={{ width: drawW, height: drawH }}
        onStartShouldSetResponder={() => true}
        onResponderRelease={onRelease}
      >
        <GameCanvas map={map} snap={snap} scale={scale} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {board}
      <Hud />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d12', alignItems: 'center', justifyContent: 'center' },
  waiting: { color: '#bbb', fontSize: 16 },
});
