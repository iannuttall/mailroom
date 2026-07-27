import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const directory = await mkdtemp(join(tmpdir(), 'mailroom-package-'))
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))

try {
  const packed = await execFileAsync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', directory],
    { cwd: process.cwd() },
  )
  const [{ filename }] = JSON.parse(packed.stdout)
  const tarball = join(directory, filename)
  const project = join(directory, 'consumer')
  await execFileAsync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--prefix',
      project,
      tarball,
    ],
    { cwd: directory },
  )

  const binary = join(project, 'node_modules', '.bin', 'mailroom')
  const version = await execFileAsync(binary, ['--version'])
  assert.equal(version.stdout.trim(), packageJson.version)

  const loaded = await execFileAsync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      [
        "import * as core from '@iannuttall/mailroom'",
        "import * as mcp from '@iannuttall/mailroom/mcp'",
        "if (typeof core.MailroomClient !== 'function') process.exit(1)",
        "if (typeof mcp.createMcpServer !== 'function') process.exit(1)",
      ].join(';'),
    ],
    { cwd: project },
  )
  assert.equal(loaded.stderr, '')
  await readFile(
    join(
      project,
      'node_modules',
      '@iannuttall',
      'mailroom',
      'integrations',
      'gmail-sent-sync',
      'Code.js',
    ),
    'utf8',
  )
  await readFile(
    join(
      project,
      'node_modules',
      '@iannuttall',
      'mailroom',
      'docs',
      'index.md',
    ),
    'utf8',
  )
  process.stdout.write('Clean package install passed.\n')
} finally {
  await rm(directory, { recursive: true, force: true })
}
