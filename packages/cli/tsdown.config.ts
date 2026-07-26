import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  fixedExtension: false,
  dts: false,
  sourcemap: true,
  clean: true,
  minify: true,
  deps: {
    alwaysBundle: [/^@mailroom\//, /^@modelcontextprotocol\/sdk(?:\/|$)/],
    neverBundle: ['@napi-rs/keyring'],
    onlyBundle: false,
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
})
