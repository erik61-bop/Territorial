import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Easing } from 'react-native';

/** Decorative, non-interactive background: soft colored glows that slowly drift and pulse over a deep
 *  base, for a living gradient feel on the menu/auth screens. Blurred on web. */
export default function Backdrop() {
  const a = useRef(new Animated.Value(0)).current;   // 0..1..0 slow loop
  const b = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (v: Animated.Value, ms: number) =>
      Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]));
    const la = loop(a, 11000), lb = loop(b, 15000);
    la.start(); lb.start();
    return () => { la.stop(); lb.stop(); };
  }, [a, b]);

  const blur = (px: number) => (Platform.OS === 'web' ? ({ filter: `blur(${px}px)` } as any) : null);
  const drift = (v: Animated.Value, x: number, y: number, s: number[]) => ({
    transform: [
      { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, y] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: s }) },
    ],
  });

  return (
    <Animated.View style={styles.fill} pointerEvents="none">
      <Animated.View style={[styles.blob, { backgroundColor: '#2f6df0', top: -120, left: -100, width: 460, height: 460 }, blur(90), drift(a, 60, 40, [1, 1.15])]} />
      <Animated.View style={[styles.blob, { backgroundColor: '#7a3cff', bottom: -160, right: -120, width: 520, height: 520, opacity: 0.28 }, blur(110), drift(b, -70, -30, [1.1, 0.95])]} />
      <Animated.View style={[styles.blob, { backgroundColor: '#13c4a3', top: '40%', right: '30%', width: 320, height: 320, opacity: 0.18 }, blur(100), drift(a, -40, 50, [0.9, 1.2])]} />
      <Animated.View style={styles.vignette} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // zIndex -1 keeps the decorative layer behind the form inputs (which are non-positioned and would
  // otherwise be painted under this absolutely-positioned view in RN-Web).
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#0b0d14', overflow: 'hidden', zIndex: -1 },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.33 },
  vignette: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,9,14,0.35)' },
});
