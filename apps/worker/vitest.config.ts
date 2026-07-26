import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    {
      name: 'mailroom-text-modules',
      enforce: 'pre',
      load(id) {
        if (!id.endsWith('.md') && !id.endsWith('.yaml')) return undefined
        return `export default ${JSON.stringify(readFileSync(id, 'utf8'))}`
      },
    },
  ],
})
