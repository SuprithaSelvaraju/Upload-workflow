import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The OCCT loader is only imported from a Web Worker, which Vite's dependency
  // scan does not follow. Pre-bundle it up front so dev does not re-optimise
  // (and reload the page) the first time a STEP file is opened.
  optimizeDeps: { include: ['occt-import-js'] },
  worker: { format: 'es' },
});
