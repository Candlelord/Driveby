import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true, // expose on LAN so a phone can hit the dev server
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
