import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],

    // Creates the test database if needed and applies the migrations, once,
    // before any spec runs.
    globalSetup: ['./test/helpers/global-setup.ts'],

    // These specs share one database. Running two files at the same time would
    // mean one truncating the tables the other is reading, so they run one
    // after another. Unit tests, which touch nothing, stay parallel.
    fileParallelism: false,
  },
});
