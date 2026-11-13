import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' -> every asset path is relative, so the built site works on
// GitHub Pages (https://<user>.github.io/<repo>/...) or any sub-folder.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 4000,
  },
});
