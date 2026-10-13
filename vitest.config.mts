import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig(({ mode }) => ({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    env: loadEnv(mode, process.cwd(), ''),   // DATABASE_URL etc. from .env / .env.local
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,                  // API tests share one database
  },
}));
