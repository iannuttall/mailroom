import { spawnSync } from 'node:child_process'

function run(command, args) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
  })
}

function hasCommand(command) {
  return (
    spawnSync('command', ['-v', command], {
      shell: true,
      stdio: 'ignore',
    }).status === 0
  )
}

if (!hasCommand('gitleaks')) {
  if (process.platform === 'darwin' && hasCommand('brew')) {
    process.stdout.write('gitleaks not found. Installing with Homebrew...\n')
    const install = run('brew', ['install', 'gitleaks'])
    if (install.status !== 0) process.exit(install.status ?? 1)
  } else {
    process.stderr.write(
      'gitleaks is required: https://github.com/gitleaks/gitleaks\n',
    )
    process.exit(1)
  }
}

const directoryScan = run('gitleaks', [
  'dir',
  '.',
  '--redact',
  '--no-banner',
  '--verbose',
])
if (directoryScan.status !== 0) process.exit(directoryScan.status ?? 1)

const hasCommit =
  spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    stdio: 'ignore',
  }).status === 0
if (!hasCommit) process.exit(0)

const historyScan = run('gitleaks', [
  'git',
  '.',
  '--redact',
  '--no-banner',
  '--verbose',
])

process.exit(historyScan.status ?? 1)
