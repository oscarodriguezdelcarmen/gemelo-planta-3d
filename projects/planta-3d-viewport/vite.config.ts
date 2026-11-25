import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Planta3dViewport',
      formats: ['iife'],
      fileName: () => 'planta-3d-viewport.js',
    },
    outDir: resolve(__dirname, 'dist'),
    sourcemap: true,
  },
});
