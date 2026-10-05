import { defineConfig } from 'vite';
const buildVersion = new Date().toISOString();

export default defineConfig({
  base: './',
  define: { __DRIVE_BUILD__: JSON.stringify(buildVersion) },
  plugins: [{ name: 'drive-build-info', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify({ version: buildVersion }) });
  } }],
  server: {
    host: true, // expose on LAN so a phone can hit the dev server
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
