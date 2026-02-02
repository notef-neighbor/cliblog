import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            INTERNAL_KEY: 'test_internal_key',
            API_KEY_SECRET: 'test_api_key_secret',
            SERVICE_DOMAIN: 'cliblog.com',
            ENVIRONMENT: 'test',
          },
        },
      },
    },
  },
});
