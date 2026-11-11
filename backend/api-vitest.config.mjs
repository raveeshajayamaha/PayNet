import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['integration/api.spec.mjs'], fileParallelism: false, testTimeout: 30000, hookTimeout: 900000 } });
