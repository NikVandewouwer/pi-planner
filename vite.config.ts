import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works under any sub-path, e.g. https://<user>.github.io/pi-planner/
export default defineConfig({
  base: './',
  plugins: [react()],
})
