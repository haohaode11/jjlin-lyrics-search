import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { dataUpdatePlugin } from './scripts/data/dev-api.mjs'

// base:'./' 使构建产物可部署在任意子路径 / 纯静态托管
export default defineConfig({
  plugins: [vue(), dataUpdatePlugin()],
  base: './',
  server: { port: 5173 },
})
