import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Gera www/bridge.iife.js: bundle unico e auto-executavel que a aplicacao
 * web carrega com <script src="...">, publicando window.RootCapitai.
 */
export default defineConfig({
  build: {
    outDir: 'www',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'RootCapitaiBridge',
      formats: ['iife'],
      fileName: () => 'bridge.iife.js',
    },
    rollupOptions: {
      output: { extend: true },
    },
    target: 'es2019',
    minify: 'esbuild',
  },
});
