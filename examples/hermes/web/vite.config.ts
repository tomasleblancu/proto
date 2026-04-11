import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  server: { port: 3001 },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@app': resolve(__dirname, '../app'),
      '@proto/core-web': resolve(__dirname, '../../../packages/core-web/src'),
      '@proto/core-shared': resolve(__dirname, '../../../packages/core-shared/src'),
    },
  },
})
