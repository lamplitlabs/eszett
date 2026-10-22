import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // React Native's `__DEV__` global, read by expo and react-native modules that tests import transitively.
  define: { __DEV__: 'false' },
  resolve: {
    alias: {
      // the app's `@/` alias (tsconfig paths), so tests can import modules that reach the stores
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // expo-file-system pulls in expo's winter runtime, which cannot load under node; swap in the stub.
      'expo-file-system': fileURLToPath(new URL('./src/test/stubs/expo-file-system.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
