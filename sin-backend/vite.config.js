import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Rutas relativas: el build resultante sirve en cualquier subruta (por ejemplo
  // GitHub Pages en /emprendimientoinsumos/ o un hosting estático cualquiera).
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
