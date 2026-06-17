// Tiny synthesized sound effects via the Web Audio API — no asset files to bundle.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number) {
  const c = audio();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur);
}

export const sfx = {
  capture: () => tone(660, 0.10, 'triangle', 0.05),
  loss: () => tone(160, 0.18, 'sawtooth', 0.06),
  war: () => tone(440, 0.22, 'square', 0.05),
  finalWar: () => { tone(300, 0.32, 'square', 0.06); tone(450, 0.32, 'square', 0.04); },
  win: () => { tone(523, 0.15, 'triangle', 0.06); tone(784, 0.3, 'triangle', 0.06); },
};
