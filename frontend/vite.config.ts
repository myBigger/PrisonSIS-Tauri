import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 子目录部署，必须配置 base
  base: process.env.TAURI_ENV_PLATFORM !== undefined ? '/' : '/PrisonSIS-Tauri/',
})
