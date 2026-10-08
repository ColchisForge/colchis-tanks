import { defineConfig } from 'vitest/config';

// A relative base keeps every asset URL relative to index.html, so the build
// works at https://USERNAME.github.io/colchis-tanks/ as well as at any other path.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
