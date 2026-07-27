import {
  access,
  lstat,
  opendir,
  readdir,
  readFile,
  readlink,
} from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const skippedDirectories = new Set([
  '.git',
  '.turbo',
  '.wrangler',
  'dist',
  'node_modules',
])

async function markdownFiles(directory = root) {
  const files = []
  const entries = await opendir(directory)
  for await (const entry of entries) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(path)))
    } else if (entry.name.endsWith('.md')) {
      files.push(path)
    }
  }
  return files
}

function localTarget(rawTarget) {
  const target = rawTarget.replace(/^<|>$/g, '')
  if (
    !target ||
    target.startsWith('#') ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  ) {
    return null
  }
  return decodeURIComponent(target.split('#', 1)[0].split('?', 1)[0])
}

const problems = []
const linkPattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g

for (const file of (await markdownFiles()).sort()) {
  const source = await readFile(file, 'utf8')
  for (const match of source.matchAll(linkPattern)) {
    const target = localTarget(match[1])
    if (!target) continue
    const destination = resolve(dirname(file), target)
    try {
      await access(destination)
    } catch {
      problems.push(
        `${relative(root, file)}: missing local link target ${match[1]}`,
      )
    }
  }
}

const docsIndex = await readFile(resolve(root, 'docs/index.md'), 'utf8')
for (const name of (await readdir(resolve(root, 'docs'))).sort()) {
  if (!name.endsWith('.md') || name === 'index.md') continue
  if (!docsIndex.includes(`(${name})`)) {
    problems.push(`docs/index.md: missing docs entry for ${name}`)
  }
}

const claudePath = resolve(root, 'CLAUDE.md')
const claude = await lstat(claudePath)
if (!claude.isSymbolicLink() || (await readlink(claudePath)) !== 'AGENTS.md') {
  problems.push('CLAUDE.md must be a symlink to AGENTS.md')
}

if (problems.length) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
