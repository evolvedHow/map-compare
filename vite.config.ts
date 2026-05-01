import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/map-compare/',
  plugins: [tailwindcss(), svelte()],
  optimizeDeps: {
    include: ['leaflet', 'shpjs']
  }
});
