import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { MailroomClient, MailroomError } from '@mailroom/core'
import {
  deleteKeyringPassword,
  getKeyringPassword,
  setKeyringPassword,
} from './keyring.js'

const KEYRING_SERVICE = 'dev.iannuttall.mailroom'
const KEYRING_ACCOUNT = 'default'

export type MailroomConfig = {
  apiUrl: string
}

export function configPath(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(base, 'mailroom', 'config.json')
}

export async function readConfig(): Promise<MailroomConfig | undefined> {
  try {
    const parsed = JSON.parse(await readFile(configPath(), 'utf8')) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as { apiUrl?: unknown }).apiUrl !== 'string'
    ) {
      throw new MailroomError(
        'INVALID_INPUT',
        `Mailroom config is invalid at ${configPath()}.`,
      )
    }
    return { apiUrl: (parsed as { apiUrl: string }).apiUrl }
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return undefined
    }
    throw error
  }
}

export async function writeConfig(config: MailroomConfig): Promise<void> {
  const path = configPath()
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  })
  await rename(temporary, path)
  await chmod(path, 0o600)
}

export async function saveCredentials(
  apiUrl: string,
  token: string,
): Promise<void> {
  await setKeyringPassword(KEYRING_SERVICE, KEYRING_ACCOUNT, token)
  await writeConfig({ apiUrl: apiUrl.replace(/\/+$/, '') })
}

export async function clearCredentials(): Promise<boolean> {
  return deleteKeyringPassword(KEYRING_SERVICE, KEYRING_ACCOUNT)
}

export async function resolveCredentials(): Promise<{
  apiUrl: string
  token: string
}> {
  const config = await readConfig()
  const apiUrl = process.env.MAILROOM_API_URL ?? config?.apiUrl
  const token =
    process.env.MAILROOM_API_TOKEN ??
    (await getKeyringPassword(KEYRING_SERVICE, KEYRING_ACCOUNT))

  if (!apiUrl || !token) {
    throw new MailroomError(
      'AUTH_REQUIRED',
      'Mailroom is not connected. Run `mailroom auth login`.',
    )
  }
  return { apiUrl, token }
}

export async function createAuthenticatedClient(): Promise<MailroomClient> {
  const credentials = await resolveCredentials()
  return new MailroomClient({
    baseUrl: credentials.apiUrl,
    token: credentials.token,
  })
}
