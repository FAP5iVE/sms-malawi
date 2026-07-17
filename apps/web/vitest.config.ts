import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

import { playwright } from '@vitest/browser-playwright';

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// R19: two projects now exist.
//  - "storybook" runs the Storybook stories in headless Chromium (unchanged).
//  - "unit" runs the plain service/component unit tests under __tests__/, which
//    were previously undiscoverable because the sole configured project was
//    scoped exclusively to the Storybook addon — meaning CI's unit-tests job
//    reported a false-positive green for the lifetime of that configuration.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({ configDir: path.join(dirname, '.storybook') }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        extends: true,
        resolve: {
          alias: {
            'server-only': path.join(dirname, 'test/stubs/empty.ts'),
            '@': path.join(dirname, 'src'),
            '@shared': path.join(dirname, '..', '..', 'packages', 'shared'),
          },
        },
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: [path.join(dirname, 'test/setup.ts')],
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['node_modules/**', 'src/stories/**', 'e2e/**'],
        },
      },
    ],
  },
});
