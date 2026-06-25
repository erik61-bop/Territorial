// Entry point. The renderer is chosen per-platform via Metro's platform extensions:
//   web    -> src/render/GameCanvas.web.tsx  (plain Canvas2D — no WebGL / no WASM)
//   native -> src/render/GameCanvas.tsx      (Skia)
// SafeAreaProvider wraps the tree so on-screen overlays can offset by the device's
// notch / status bar / home indicator (the app is mobile-first). initialWindowMetrics
// avoids an inset "flash" on the first native frame.
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import GameScreen from './src/GameScreen';

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="light" />
      <GameScreen />
    </SafeAreaProvider>
  );
}
