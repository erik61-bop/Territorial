import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useGame } from '../state/store';

const SECTIONS: { h: string; b: string }[] = [
  { h: '⚔️  One army, two jobs', b: 'Your army is ONE pool — it is both your sword and your shield. Every attack you launch spends from the same pool that defends you, so attacking always leaves you exposed.' },
  { h: '🛡️  Defense ≈ twice attack', b: 'A cell’s defense is your army spread over your border — and defenders fight at ~2×, so you must roughly DOUBLE a border’s strength to break it. Fewer borders (or more army) = a harder shell. A huge empire with a long frontier is thin everywhere — mass on one point and break through. Each tile you take also costs a slice of your army, so conquest scales with your size.' },
  { h: '🌱  Grow, then fight', b: 'Tap empty (light) land to expand — it is cheap. Bank land and cities (cities give income) during the Peace opening, when rivals are hidden by fog. When War begins the fog lifts.' },
  { h: '🎯  Attack & Hold', b: 'Tap a country to keep attacking it (a standing order keeps your army flowing there). Pick how much to send: 25% safe · 50% normal · 75% aggressive · All-in risky — more power, but it leaves you weaker. Battles hit only the SHARED BORDER, not the whole country. Press Hold to stop and dig in: +25% defence (and your army rebuilds). Hotkeys: Q = Attack, Space = Hold.' },
  { h: '🤝  Diplomacy', b: 'Make peace or alliances (tap a nation → Inspect, or Quick Chat). Allies can’t attack each other — gang up on the leader. But there is no shared win: betray and fight to be the LAST one standing.' },
  { h: '⛵  Sea & islands', b: 'Coasts are safe (the sea guards them). But you can SHIP across open water: tap an island or a coast across the sea and your army invades by boat — costlier the farther it sails. Grab the little neutral islands for extra land.' },
  { h: '🗺️  Reading the map', b: 'Numbers are each nation’s army; crowns ♛ are capitals (take one to cripple its owner). Gold arrows are your attacks, red arrows are attacks on YOU. Move with drag / WASD / arrows; zoom with the wheel or +/−; click the minimap to jump.' },
];

export default function Help() {
  const show = useGame((s) => s.showHelp);
  const setShow = useGame((s) => s.setShowHelp);
  if (!show) return null;
  return (
    <Pressable style={styles.scrim} onPress={() => setShow(false)} onStartShouldSetResponder={() => true}>
      <Pressable style={styles.card} onPress={() => { /* absorb taps on the card */ }}>
        <Text style={styles.title}>How to play</Text>
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {SECTIONS.map((s) => (
            <View key={s.h} style={styles.section}>
              <Text style={styles.h}>{s.h}</Text>
              <Text style={styles.b}>{s.b}</Text>
            </View>
          ))}
        </ScrollView>
        <Pressable style={styles.btn} onPress={() => setShow(false)}>
          <Text style={styles.btnTxt}>Got it — play!</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,7,11,0.78)', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  card: { width: 460, maxWidth: '92%', maxHeight: '86%', backgroundColor: '#141824', borderWidth: 1, borderColor: '#2a3145', borderRadius: 16, padding: 20 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  body: { flexGrow: 0 },
  section: { marginBottom: 14 },
  h: { color: '#ffd54a', fontSize: 15, fontWeight: '800', marginBottom: 3 },
  b: { color: '#cdd6f4', fontSize: 14, lineHeight: 20 },
  btn: { marginTop: 14, backgroundColor: '#4c7dff', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
