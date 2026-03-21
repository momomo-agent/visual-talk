import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    https: fs.existsSync('.dev-cert.pem') ? {
      key: fs.readFileSync('.dev-key.pem'),
      cert: fs.readFileSync('.dev-cert.pem'),
    } : undefined,
  },
})
