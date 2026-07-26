import { defineConfig } from 'tsdown'

const bundledPackages = [
  /^@mailroom\//,
  /^@modelcontextprotocol\/sdk(?:\/|$)/,
]

export default defineConfig([
  {
    entry: {
      index: 'packages/core/src/index.ts',
      mcp: 'packages/mcp/src/index.ts',
    },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    fixedExtension: false,
    dts: true,
    sourcemap: true,
    clean: true,
    deps: {
      alwaysBundle: bundledPackages,
      onlyBundle: false,
    },
  },
  {
    entry: { cli: 'packages/cli/src/index.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: false,
    minify: true,
    deps: {
      alwaysBundle: bundledPackages,
      neverBundle: ['@napi-rs/keyring'],
      onlyBundle: false,
    },
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
])
