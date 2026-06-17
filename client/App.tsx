import React from 'react';
import { Platform, View, Text } from 'react-native';

// On web, Skia (CanvasKit/WASM) must be loaded before any Skia component renders, so we lazy-load
// the game screen through WithSkiaWeb. Connection is started from the menu (Play), not here.
// On native, Skia is available at once.
let App: React.ComponentType;

if (Platform.OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { WithSkiaWeb } = require('@shopify/react-native-skia/lib/module/web');
  App = function WebApp() {
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
