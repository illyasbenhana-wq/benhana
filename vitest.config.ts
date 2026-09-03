import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    // Integration tests share one live database (ethosfi-test) and several
    // files compute before/after row counts across shared tables
    // (applications/scores/decision_records/...) to prove "this operation
    // writes nothing". Running test *files* in parallel (vitest's default)
    // lets one file's fixture insert land between another file's before/
    // after snapshot, producing false failures unrelated to either file's
    // own logic. Unit tests have no such shared external state, so this
    // only trades a little wall-clock time for eliminating a real,
    // reproduced source of integration-test flakiness.
    fileParallelism: false,
    exclude: ['__tests__/integration/endpoint-isolation.test.ts', 'node_modules/**'],
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
