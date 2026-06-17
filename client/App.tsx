import React, { useEffect } from 'react';
import { Platform, View, Text } from 'react-native';
import { connect } from './src/net/socket';

// On web, Skia (CanvasKit/WASM) must be loaded before any Skia component renders, so we lazy-load
// the game screen through WithSkiaWeb. Networking starts immediately (independent of the renderer)
// so game state flows even while CanvasKit is still loading. On native, Skia is available at once.
let App: React.ComponentType;

if (Platform.OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { WithSkiaWeb } = require('@shopify/react-native-skia/lib/module/web');
  App = function WebApp() {
    useEffect(() => { connect(); }, []);
    return (
      <WithSkiaWeb
        getComponent={() => import('./src/GameScreen')}
        fallback={
          <View style={{ flex: 1, backgroundColor: '#0d0d12', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#bbb' }}>loading renderer…</Text>
          </View>
        }
      />
    );
  };
} else {
  App = require('./src/GameScreen').default;
}

export default App;
