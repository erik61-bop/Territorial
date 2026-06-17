// Entry point. The renderer is chosen per-platform via Metro's platform extensions:
//   web    -> src/render/GameCanvas.web.tsx  (plain Canvas2D — no WebGL / no WASM)
//   native -> src/render/GameCanvas.tsx      (Skia)
// So nothing platform-specific is needed here; just render the game screen.
export { default } from './src/GameScreen';
