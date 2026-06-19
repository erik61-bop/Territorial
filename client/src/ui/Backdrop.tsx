import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';

/** Decorative, non-interactive background: soft colored glows over a deep base, for the menu/auth
 *  screens. Blurred on web for a smooth gradient feel; falls back to soft circles elsewhere. */
export default function Backdrop() {
  const blur = (px: number) => (Platform.OS === 'web' ? ({ filter: `blur(${px}px)` } as any) : null);
  return (
    <View style={styles.fill} pointerEvents="none">
      <View style={[styles.blob, { backgroundColor: '#2f6df0', top: -120, left: -100, width: 460, height: 460 }, blur(90)]} />
      <View style={[styles.blob, { backgroundColor: '#7a3cff', bottom: -160, right: -120, width: 520, height: 520, opacity: 0.28 }, blur(110)]} />
      <View style={[styles.blob, { backgroundColor: '#13c4a3', top: '40%', right: '30%', width: 320, height: 320, opacity: 0.18 }, blur(100)]} />
      <View style={styles.vignette} />
    </View>
  );
}

const styles = StyleSheet.create({
  // zIndex -1 keeps the decorative layer behind the form inputs (which are non-positioned and would
  // otherwise be painted under this absolutely-positioned view in RN-Web).
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#0b0d14', overflow: 'hidden', zIndex: -1 },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.33 },
  vignette: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,9,14,0.35)' },
});
