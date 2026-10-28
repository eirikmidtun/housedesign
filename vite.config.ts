import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works on GitHub Pages and other static hosts.
export default defineConfig({
  base: './',
  plugins: [react()],
})
