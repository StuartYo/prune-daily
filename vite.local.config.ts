// Local preview of the game in a normal browser, no Reddit account needed.
// Uses the real game rules with an in-browser store and sample players.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r('./src/client'),
  mode: 'preview',
  plugins: [react(), tailwind()],
  resolve: {
    alias: { '@devvit/web/client': r('./src/client/local/devvit-stub.ts') },
  },
  build: {
    outDir: r('./dist/local'),
    emptyOutDir: true,
    rollupOptions: { input: { game: r('./src/client/game.html'), splash: r('./src/client/splash.html') } },
  },
  server: { port: 5199 },
  preview: { port: 5199 },
});
