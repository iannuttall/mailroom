import { opendir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const skippedDirectories = new Set([
  '.git',
  '.turbo',
  '.wrangler',
  'dist',
  'node_modules',
])

async function collect(directory = '.') {
  const files = []
  const entries = await opendir(directory)
  for await (const entry of entries) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collect(path)))
    } else if (
      (entry.name.endsWith('.md') || entry.name.endsWith('.ts')) &&
      entry.name !== 'worker-configuration.d.ts'
    ) {
      files.push(path)
    }
  }
  return files
}

const problems = []
for (const file of (await collect()).sort()) {
  if (file === 'CONTENT.md' || file === './CONTENT.md') continue
  const source = await readFile(file, 'utf8')
  for (const [index, line] of source.split('\n').entries()) {
    if (line.includes('—')) {
      problems.push(`${file}:${index + 1}: replace the em dash`)
    }
    if (/\b(?:seamless|robust)\b/i.test(line)) {
      problems.push(`${file}:${index + 1}: remove vague marketing language`)
    }
  }
}

if (problems.length) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
