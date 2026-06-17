import React, { useRef } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';

/** Minimal cross-platform slider (track + thumb via PanResponder). value in [min, max]. */
export default function Slider({
  value,
  onChange,
  width = 240,
  min = 0.05,
  max = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  width?: number;
  min?: number;
  max?: number;
}) {
  const set = (x: number) => {
    const f = Math.max(0, Math.min(1, x / width));
    onChange(Math.max(min, Math.min(max, f)));
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => set(e.nativeEvent.locationX),
      onPanResponderMove: (e) => set(e.nativeEvent.locationX),
    }),
  ).current;

  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.track, { width }]} {...pan.panHandlers}>
      <View style={[styles.base, { width }]} />
      <View style={[styles.fill, { width: width * pct }]} />
      <View style={[styles.thumb, { left: width * pct - 10 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 26, justifyContent: 'center' },
  base: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: '#3a3f52' },
  fill: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: '#4c7dff' },
  thumb: {
    position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
    borderWidth: 2, borderColor: '#4c7dff', top: 3,
  },
});
