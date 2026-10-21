// Standalone Vitest config for renderer/main tests; Vite+ handles lint/format.
// The Electron dev/build pipeline lives in electron.vite.config.ts.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // `vp fmt` / `vp check` read Oxfmt settings from here, not from .oxfmtrc.json
  // (kept in sync with it for editor integrations).
  fmt: {
    printWidth: 100,
    singleQuote: true,
    ignorePatterns: ['out/**', 'dist/**', 'release/**', 'src/renderer/src/components/ui/**'],
  },
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __DISTRIBUTION_TARGET__: JSON.stringify('direct'),
    __WEB_DEPLOYMENT__: false,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src/renderer/src'),
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      '@vercel/oidc': resolve(import.meta.dirname, 'src/renderer/src/lib/vercel-oidc-browser.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: { exclude: ['@scalar/api-reference-react'] },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/renderer/src/test/setup.ts'],
    // Slow CI hosts (the macOS Intel runner) raise vitest's 5s per-test budget.
    testTimeout: Number(process.env.VOICESTUDIO_TEST_TIMEOUT_MS) || 5_000,
    include: [
      'src/main/**/*.test.{ts,tsx}',
      'src/renderer/**/*.test.{ts,tsx}',
      'src/shared/repair-request.test.ts',
      'src/shared/download-failure.test.ts',
    ],
    css: false,
  },
});
