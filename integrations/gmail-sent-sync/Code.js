const MAILROOM_SOURCE = 'gmail-sent'
const LAST_SYNC_PROPERTY = 'MAILROOM_LAST_SYNC_SECONDS'
const DEFAULT_LOOKBACK_SECONDS = 24 * 60 * 60
const OVERLAP_SECONDS = 10 * 60
const MAX_PAGES = 20
const PAGE_SIZE = 100
const HEADER_SCAN_BYTES = 128 * 1024

function requiredProperty(properties, name) {
  const value = properties.getProperty(name)
  if (!value?.trim()) {
    throw new Error(`Add the ${name} script property before syncing.`)
  }
  return value.trim()
}

function configuredAddresses(value) {
  const addresses = value
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean)
  if (!addresses.length) {
    throw new Error('Add at least one GMAIL_FROM_ADDRESSES address.')
  }
  return [...new Set(addresses)]
}

function buildSearchQuery(afterSeconds) {
  return `after:${afterSeconds}`
}

function syncAfter(previousValue, startedAt) {
  const previous =
    previousValue === null || previousValue === ''
      ? Number.NaN
      : Number(previousValue)
  return Number.isFinite(previous)
    ? Math.max(0, previous - OVERLAP_SECONDS)
    : startedAt - DEFAULT_LOOKBACK_SECONDS
}

function unfoldHeaders(headerBlock) {
  return headerBlock.replace(/\r?\n[ \t]+/g, ' ')
}

function extractHeaderFromText(rawText, name) {
  const headerBlock = rawText.split(/\r?\n\r?\n/, 1)[0] || ''
  const unfolded = unfoldHeaders(headerBlock)
  const prefix = `${name.toLowerCase()}:`
  const line = unfolded
    .split(/\r?\n/)
    .find((candidate) => candidate.toLowerCase().startsWith(prefix))
  return line ? line.slice(line.indexOf(':') + 1).trim() : ''
}

function extractEmailAddress(value) {
  const bracketed = value.match(/<([^<>\s]+@[^<>\s]+)>/)
  if (bracketed) return bracketed[1].toLowerCase()
  const plain = value.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+/i)
  return plain ? plain[0].toLowerCase() : ''
}

function mailboxFromRaw(rawBytes) {
  const prefix = rawBytes.slice(0, HEADER_SCAN_BYTES)
  const text = Utilities.newBlob(prefix).getDataAsString('UTF-8')
  return extractEmailAddress(extractHeaderFromText(text, 'From'))
}

function mailboxFromMetadata(message) {
  const headers = message.payload?.headers || []
  const from = headers.find((header) => header.name?.toLowerCase() === 'from')
  return extractEmailAddress(from?.value || '')
}

function bytesToHex(bytes) {
  return bytes
    .map((byte) => ((byte + 256) % 256).toString(16).padStart(2, '0'))
    .join('')
}

function sha256Hex(bytes) {
  return bytesToHex(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes),
  )
}

function buildCanonicalImport(input) {
  return [
    'mailroom-import-v1',
    input.timestamp,
    input.idempotencyKey,
    MAILROOM_SOURCE,
    input.account.toLowerCase(),
    input.providerMessageId,
    input.mailbox.toLowerCase(),
    input.bodySha256.toLowerCase(),
  ].join('\n')
}

function signatureHex(secret, input) {
  return bytesToHex(
    Utilities.computeHmacSha256Signature(buildCanonicalImport(input), secret),
  )
}

function gmailMessagesPage(query, pageToken) {
  const options = {
    labelIds: ['SENT'],
    maxResults: PAGE_SIZE,
    q: query,
  }
  if (pageToken) options.pageToken = pageToken
  return Gmail.Users.Messages.list('me', options)
}

function managedMailbox(config, summary) {
  const message = Gmail.Users.Messages.get('me', summary.id, {
    format: 'metadata',
    metadataHeaders: ['From'],
  })
  const mailbox = mailboxFromMetadata(message)
  return config.addresses.includes(mailbox) ? mailbox : ''
}

function padWebSafeBase64(value) {
  return value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=')
}

function gmailRawBytes(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    return Utilities.base64DecodeWebSafe(padWebSafeBase64(value))
  }
  throw new Error('Gmail returned raw content in an unsupported format.')
}

function sendRawMessage(config, summary, expectedMailbox) {
  const message = Gmail.Users.Messages.get('me', summary.id, {
    format: 'raw',
  })
  if (!message.raw) {
    throw new Error(`Gmail did not return raw content for ${summary.id}.`)
  }

  const rawBytes = gmailRawBytes(message.raw)
  const mailbox = mailboxFromRaw(rawBytes)
  if (mailbox !== expectedMailbox || !config.addresses.includes(mailbox)) {
    throw new Error(
      `Gmail message ${summary.id} changed From address while syncing.`,
    )
  }

  const timestamp = String(Date.now())
  const idempotencyKey = `${MAILROOM_SOURCE}:${config.account}:${summary.id}`
  const signed = {
    timestamp,
    idempotencyKey,
    account: config.account,
    providerMessageId: summary.id,
    mailbox,
    bodySha256: sha256Hex(rawBytes),
  }
  const response = UrlFetchApp.fetch(config.url, {
    method: 'post',
    contentType: 'message/rfc822',
    payload: rawBytes,
    muteHttpExceptions: true,
    headers: {
      'x-mailroom-timestamp': timestamp,
      'x-mailroom-idempotency-key': idempotencyKey,
      'x-mailroom-account': config.account,
      'x-mailroom-provider-message-id': summary.id,
      'x-mailroom-mailbox': mailbox,
      'x-mailroom-body-sha256': signed.bodySha256,
      'x-mailroom-signature': signatureHex(config.secret, signed),
    },
  })
  const status = response.getResponseCode()
  if (status !== 200 && status !== 201) {
    const detail = response.getContentText().slice(0, 500)
    throw new Error(
      `Mailroom rejected Gmail message ${summary.id} with HTTP ${status}: ${detail}`,
    )
  }
}

function loadConfig(properties) {
  const baseUrl = requiredProperty(properties, 'MAILROOM_URL').replace(
    /\/+$/,
    '',
  )
  return {
    account: requiredProperty(properties, 'GMAIL_ACCOUNT').toLowerCase(),
    addresses: configuredAddresses(
      requiredProperty(properties, 'GMAIL_FROM_ADDRESSES'),
    ),
    secret: requiredProperty(properties, 'MAILROOM_SYNC_SECRET'),
    url: `${baseUrl}/v1/ingress/gmail-sent`,
  }
}

function syncSentMail() {
  const properties = PropertiesService.getScriptProperties()
  const config = loadConfig(properties)
  const startedAt = Math.floor(Date.now() / 1000)
  const after = syncAfter(properties.getProperty(LAST_SYNC_PROPERTY), startedAt)
  const query = buildSearchQuery(after)

  let imported = 0
  let checked = 0
  let pageToken
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = gmailMessagesPage(query, pageToken)
    for (const message of result.messages || []) {
      checked += 1
      const mailbox = managedMailbox(config, message)
      if (mailbox) {
        sendRawMessage(config, message, mailbox)
        imported += 1
      }
    }
    pageToken = result.nextPageToken
    if (!pageToken) break
    if (page === MAX_PAGES - 1) {
      throw new Error('Gmail Sent sync exceeded its bounded page limit.')
    }
  }

  properties.setProperty(LAST_SYNC_PROPERTY, String(startedAt))
  console.log(
    `Mailroom checked ${checked} Gmail Sent messages and imported ${imported} managed messages.`,
  )
  return imported
}

// biome-ignore lint/correctness/noUnusedVariables: Google Apps Script entry point.
function installMailroomSentSync() {
  const properties = PropertiesService.getScriptProperties()
  loadConfig(properties)
  properties.deleteProperty(LAST_SYNC_PROPERTY)
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'syncSentMail') {
      ScriptApp.deleteTrigger(trigger)
    }
  }
  ScriptApp.newTrigger('syncSentMail').timeBased().everyMinutes(5).create()
  return syncSentMail()
}

// biome-ignore lint/correctness/noUnusedVariables: Google Apps Script entry point.
function diagnoseMailroomSentSync() {
  const properties = PropertiesService.getScriptProperties()
  const config = loadConfig(properties)
  const profile = Gmail.Users.getProfile('me')
  const latest = Gmail.Users.Messages.list('me', {
    labelIds: ['SENT'],
    maxResults: 10,
  })
  const recent = gmailMessagesPage(
    buildSearchQuery(Math.floor(Date.now() / 1000) - DEFAULT_LOOKBACK_SECONDS),
  )
  const report = {
    authorizedAccount: profile.emailAddress,
    configuredAccount: config.account,
    sentEstimate: latest.resultSizeEstimate || 0,
    latestSentIds: (latest.messages || []).map((message) => message.id),
    recentSentIds: (recent.messages || []).map((message) => message.id),
  }
  console.log(JSON.stringify(report))
  return report
}

// biome-ignore lint/correctness/noUnusedVariables: Google Apps Script entry point.
function uninstallMailroomSentSync() {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'syncSentMail') {
      ScriptApp.deleteTrigger(trigger)
    }
  }
}
