// Tiny synthesized audio via the Web Audio API — no asset files to bundle. SFX plus a low ambient
// war-drone pad that loops while you play.
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

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
  const c = audio();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime + delay;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur);
}

// Ambient pad: two detuned low oscillators through a slowly wobbling gain.
let ambient: { stop: () => void } | null = null;
function ambientStart() {
  const c = audio();
  if (!c || ambient) return;
  const master = c.createGain();
  master.gain.value = 0.0;
  master.gain.linearRampToValueAtTime(0.05, c.currentTime + 2);
  master.connect(c.destination);
  const oscs = [55, 82.5, 110].map((f, i) => {
    const o = c.createOscillator();
    o.type = i === 2 ? 'triangle' : 'sine';
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = i === 2 ? 0.25 : 0.6;
    o.connect(g); g.connect(master); o.start();
    return o;
  });
  // Slow LFO for movement.
  const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
  const lfoG = c.createGain(); lfoG.gain.value = 0.02;
  lfo.connect(lfoG); lfoG.connect(master.gain); lfo.start();
  ambient = {
    stop: () => {
      master.gain.cancelScheduledValues(c.currentTime);
      master.gain.linearRampToValueAtTime(0, c.currentTime + 0.6);
      setTimeout(() => { oscs.forEach((o) => o.stop()); lfo.stop(); }, 700);
    },
  };
}
function ambientStop() { if (ambient) { ambient.stop(); ambient = null; } }

export const sfx = {
  capture: () => tone(660, 0.10, 'triangle', 0.05),
  loss: () => tone(160, 0.18, 'sawtooth', 0.06),
  attack: () => tone(520, 0.07, 'square', 0.035),
  war: () => { tone(440, 0.22, 'square', 0.05); tone(330, 0.28, 'square', 0.04); },
  finalWar: () => { tone(300, 0.32, 'square', 0.06); tone(450, 0.32, 'square', 0.04); },
  eliminate: () => { tone(330, 0.18, 'sawtooth', 0.05); tone(220, 0.26, 'sawtooth', 0.05, 0.10); },
  capitalFell: () => { tone(90, 0.5, 'sawtooth', 0.10); tone(140, 0.4, 'square', 0.05, 0.05); },
  win: () => { tone(523, 0.15, 'triangle', 0.06); tone(784, 0.3, 'triangle', 0.06, 0.12); tone(1047, 0.4, 'triangle', 0.05, 0.24); },
  ambientStart,
  ambientStop,
};
