import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { existsSync } from 'fs'

function monorepoAliases(): Record<string, string> {
  const coreWeb = resolve(__dirname, '../../../packages/proto/core-web/src')
  const coreShared = resolve(__dirname, '../../../packages/proto/core-shared/src')
  if (!existsSync(coreWeb)) return {}
  return {
    '@tleblancureta/proto/web': coreWeb,
    '@tleblancureta/proto/shared': coreShared,
  }
}

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  server: { port: 3001 },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@app': resolve(__dirname, '../app'),
      ...monorepoAliases(),
    },
  },
})
