import { password, text } from '@clack/prompts'
import { MailroomClient, MailroomError } from '@mailroom/core'
import { defineCommand } from 'citty'
import { stringArg } from '../args.js'
import {
  clearCredentials,
  readConfig,
  resolveCredentials,
  saveCredentials,
} from '../config.js'
import { getKeyringPassword } from '../keyring.js'
import { printJson } from '../output.js'

const loginCommand = defineCommand({
  meta: {
    name: 'login',
    description: 'Connect the CLI to a Mailroom Worker',
  },
  args: {
    url: {
      type: 'string',
      description: 'Mailroom Worker URL.',
    },
    'token-stdin': {
      type: 'boolean',
      default: false,
      description: 'Read the API token from standard input.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    let apiUrl = stringArg(args.url) ?? process.env.MAILROOM_API_URL
    if (!apiUrl && process.stdin.isTTY) {
      const answer = await text({
        message: 'Mailroom Worker URL',
        placeholder: 'https://mailroom.example.workers.dev',
      })
      if (typeof answer === 'symbol') return
      apiUrl = answer
    }

    let token = process.env.MAILROOM_API_TOKEN
    if (args['token-stdin'] === true) {
      const chunks: Uint8Array[] = []
      let size = 0
      for await (const chunk of process.stdin) {
        const bytes =
          typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
        size += bytes.byteLength
        if (size > 16_384) {
          throw new MailroomError(
            'INVALID_INPUT',
            'The API token is too large.',
          )
        }
        chunks.push(bytes)
      }
      token = Buffer.concat(chunks).toString('utf8').trim()
    } else if (!token && process.stdin.isTTY) {
      const answer = await password({
        message: 'API token',
        mask: '•',
      })
      if (typeof answer === 'symbol') return
      token = answer
    }

    if (!apiUrl || !token) {
      throw new MailroomError(
        'INVALID_INPUT',
        'Provide --url and use an interactive prompt, MAILROOM_API_TOKEN, or --token-stdin.',
      )
    }

    const result = await new MailroomClient({
      baseUrl: apiUrl,
      token,
    }).runOperation('system.status', {})
    await saveCredentials(apiUrl, token)
    if (args.json === true) {
      printJson({ connected: true, apiUrl, status: result.data })
      return
    }
    process.stdout.write(`Connected to ${apiUrl.replace(/\/+$/, '')}.\n`)
  },
})

const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show the configured Worker and optionally check it',
  },
  args: {
    check: {
      type: 'boolean',
      default: false,
      description: 'Make an authenticated request to the Worker.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const config = await readConfig()
    const token =
      process.env.MAILROOM_API_TOKEN ??
      (await getKeyringPassword('dev.iannuttall.mailroom', 'default'))
    const state: Record<string, unknown> = {
      configured: Boolean(config?.apiUrl && token),
      apiUrl: process.env.MAILROOM_API_URL ?? config?.apiUrl ?? null,
      tokenStored: Boolean(token),
    }
    if (args.check === true) {
      const credentials = await resolveCredentials()
      state.worker = (
        await new MailroomClient({
          baseUrl: credentials.apiUrl,
          token: credentials.token,
        }).runOperation('system.status', {})
      ).data
    }
    if (args.json === true) printJson(state)
    else {
      process.stdout.write(
        state.configured
          ? `Connected configuration for ${state.apiUrl}.\n`
          : 'Mailroom is not connected. Run `mailroom auth login`.\n',
      )
    }
  },
})

const logoutCommand = defineCommand({
  meta: {
    name: 'logout',
    description: 'Remove the Mailroom token from the local Keychain',
  },
  run: async () => {
    const removed = await clearCredentials()
    process.stdout.write(
      removed
        ? 'Removed the Mailroom token.\n'
        : 'No Mailroom token was stored.\n',
    )
  },
})

export const authCommand = defineCommand({
  meta: {
    name: 'auth',
    description: 'Manage the local Worker connection',
  },
  subCommands: {
    login: loginCommand,
    status: statusCommand,
    logout: logoutCommand,
  },
})
