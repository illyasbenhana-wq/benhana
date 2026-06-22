import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    env: Object.fromEntries(
      require('fs').existsSync('.env.test')
        ? require('fs').readFileSync('.env.test', 'utf8')
            .split('\n')
            .filter((l: string) => l && !l.startsWith('#'))
            .map((l: string) => l.split('=').map(s => s.trim()))
        : []
    ),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
