import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '../state/store';

const LIFE = 6000;   // ms an event stays before it's gone
const FADE = 1500;   // ms of fade-out at the end

/** Top-centre scrolling feed of recent game events (eliminations, capitals, treaties). */
export default function EventFeed() {
  const insets = useSafeAreaInsets();
  const events = useGame((s) => s.gameEvents);
  const [, tick] = useState(0);
  // re-render a few times a second so events fade out over time
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 400);
    return () => clearInterval(id);
  }, []);

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const shown = events.filter((e) => now - e.t < LIFE);
  if (!shown.length) return null;

  return (
    <View style={[styles.wrap, { top: 64 + insets.top }]} pointerEvents="none">
      {shown.map((e) => {
        const age = now - e.t;
        const opacity = age > LIFE - FADE ? Math.max(0, (LIFE - age) / FADE) : 1;
        return <Text key={e.key} style={[styles.line, { color: e.color, opacity }]}>{e.text}</Text>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 64, alignSelf: 'center', alignItems: 'center', gap: 3, zIndex: 5 },
  line: {
    fontSize: 14, fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.95)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
});
