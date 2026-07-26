import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))

test('the public package has one API, CLI, and MCP surface', () => {
  assert.equal(packageJson.name, '@iannuttall/mailroom')
  assert.equal(packageJson.private, undefined)
  assert.equal(packageJson.bin.mailroom, './dist/cli.js')
  assert.equal(packageJson.exports['.'].import, './dist/index.js')
  assert.equal(packageJson.exports['./mcp'].import, './dist/mcp.js')
  assert.equal(packageJson.license, 'Apache-2.0')
  assert.equal(
    packageJson.repository.url,
    'git+https://github.com/iannuttall/mailroom.git',
  )
})

test('the public TypeScript and MCP entry points load', async () => {
  const [core, mcp] = await Promise.all([
    import('../dist/index.js'),
    import('../dist/mcp.js'),
  ])
  assert.equal(typeof core.MailroomClient, 'function')
  assert.equal(typeof core.listOperations, 'function')
  assert.equal(typeof core.signIngressRequest, 'function')
  assert.equal(typeof core.signRelayRequest, 'function')
  assert.equal(typeof mcp.createMcpServer, 'function')
  assert.equal(typeof mcp.registerDiscoveryTools, 'function')
})

test('public bundles do not import private workspace packages', async () => {
  const files = (await readdir('dist')).filter((file) => file.endsWith('.js'))
  assert.ok(files.length >= 3)
  for (const file of files) {
    const source = await readFile(`dist/${file}`, 'utf8')
    assert.doesNotMatch(source, /(?:from\s*|import\()['"]@mailroom\//)
  }
})

test('the CLI bundle is executable and reports its version', async () => {
  const source = await readFile('dist/cli.js', 'utf8')
  assert.match(source, /^#!\/usr\/bin\/env node\n/)
  const result = await execFileAsync(process.execPath, [
    'dist/cli.js',
    '--version',
  ])
  assert.equal(result.stdout.trim(), packageJson.version)
})

test('the CLI emits parseable JSON without trailing help', async () => {
  const result = await execFileAsync(process.execPath, [
    'dist/cli.js',
    'operations',
    'describe',
    'messages.get',
    '--json',
  ])
  const output = JSON.parse(result.stdout)
  assert.equal(output.operation.id, 'messages.get')
})

test('agent skill, prompts, config, and policies ship', async () => {
  const required = [
    'skills/mailroom/SKILL.md',
    'skills/mailroom/agents/openai.yaml',
    'prompts/shared/safety.md',
    'prompts/classify/sponsorship.md',
    'config/automations.yaml',
    'config/offers.yaml',
    'PRIVACY.md',
    'SECURITY.md',
    'TERMS.md',
    'TRADEMARKS.md',
  ]
  await Promise.all(required.map((file) => readFile(file, 'utf8')))
  assert.ok(packageJson.files.includes('skills'))
  assert.ok(packageJson.files.includes('prompts'))
  assert.ok(packageJson.files.includes('config'))
})

test('no public metadata contains a personal support email or secret', () => {
  const source = JSON.stringify(packageJson)
  assert.doesNotMatch(source, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)
  assert.doesNotMatch(source, /MAILROOM_API_TOKEN=|INGRESS_SECRET=/)
})
