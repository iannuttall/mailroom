# Configure Mailroom

Mailroom has three configuration layers. Wrangler configuration declares public
resource bindings. Wrangler secrets hold production credentials and private
destinations. The local CLI keeps its API token in the operating system
keychain.

Do not put a production secret in `wrangler.jsonc`, `.dev.vars.example`, a
shell profile, an issue, a prompt, or an Apps Script source file.

## Keep deployment configuration out of commits

The tracked Worker configurations contain placeholders. Copy them before adding
real resource IDs, domains, or email addresses:

```sh
cp apps/worker/wrangler.jsonc apps/worker/wrangler.local.jsonc
cp apps/ingress/wrangler.jsonc apps/ingress/wrangler.local.jsonc
```

Files matching `apps/*/wrangler.*.jsonc` are ignored. The tracked
`wrangler.jsonc` files remain safe templates for forks and tests.

Pass the private configuration to Wrangler:

```sh
pnpm --filter @mailroom/worker exec wrangler deploy \
  --config wrangler.local.jsonc
```

Omit the ingress copy when every domain belongs to the central Cloudflare
account.

## Central Worker bindings

| Binding | Resource | Required | Purpose |
| --- | --- | --- | --- |
| `DB` | D1 database | Yes | Domains, routes, messages, threads, drafts, audit state, and FTS |
| `RAW` | R2 bucket | Yes | Original `.eml` files and extracted attachments |
| `INGEST_QUEUE` | Workers Queue | Yes | Parses archived inbound mail and writes it to D1 |
| `AI_SEARCH` | AI Search instance | Yes | Compact semantic and hybrid message retrieval |
| `AI` | Workers AI | Yes | Optional classification and drafting |
| `EMAIL` | Email Service send binding | Yes for replies | Outbound delivery from approved addresses |

Keep `EMAIL.allowed_sender_addresses` narrow. Add only addresses Mailroom may
send from. Every sender domain must be onboarded in Email Sending on the same
Cloudflare account as the binding.

The Worker must also be the consumer of `mailroom-ingest`. Keep the scheduled
trigger at `*/5 * * * *`. The trigger re-enqueues R2 pending jobs after Queue,
Worker, route, parsing, or D1 failures.

## Central Worker variables

Variables are non-secret and belong in the private Wrangler configuration when
they differ from the public defaults.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ENVIRONMENT` | `production` | Returned by system status and stored with service context |
| `AI_MODEL` | `@cf/meta/llama-3.1-8b-instruct-fast` | Model used by optional automation tests |
| `MAX_EMAIL_BYTES` | `26214400` | Maximum inbound or imported MIME accepted by Mailroom |

Cloudflare Email Sending currently has a smaller outbound message limit than
Mailroom's inbound limit. Check the
[current Email Service limits](https://developers.cloudflare.com/email-service/platform/limits/)
before sending attachments.

## Central Worker secrets

| Secret | Required | Shared with | Purpose |
| --- | --- | --- | --- |
| `MAILROOM_API_TOKEN` | Yes | CLI, MCP, and trusted API clients | Authenticates `/v1/operations` |
| `INGRESS_SECRET` | Yes | Each cross-account ingress Worker | Signs relayed inbound and outbound requests |
| `GMAIL_SYNC_SECRET` | Only for Gmail Sent sync | One user-owned Apps Script | Signs imported Gmail Sent MIME |
| `MAILROOM_FORWARD_TO` | Only for forwarding | Nobody | Fallback verified Email Routing destination |
| `MAILROOM_FORWARD_TO_BY_DOMAIN` | Only for per-domain forwarding | Nobody | JSON map from recipient domains to verified Email Routing destinations |
| `TELEGRAM_BOT_TOKEN` | Only for Telegram | Telegram | Sends accepted-message notifications |
| `TELEGRAM_CHAT_ID` | Only for Telegram | Telegram | Selects the notification chat |
| `TELEGRAM_NOTIFY_MAILBOXES` | Only for Telegram | Nobody | JSON array of exact mailbox addresses that may trigger notifications |

Use a different random value for each authentication boundary. Do not reuse a
Cloudflare API token for a Mailroom secret.

Store a secret against the private Worker configuration:

```sh
pnpm --filter @mailroom/worker exec wrangler secret put MAILROOM_API_TOKEN \
  --config wrangler.local.jsonc
```

Repeat the command with each secret name you need.

Telegram notifications are off unless all three Telegram secrets are present.
Set `TELEGRAM_NOTIFY_MAILBOXES` to an explicit list of mailbox addresses:

```json
["alerts@example.com", "support@example.net"]
```

Use `[]` or remove any one of the Telegram secrets to disable all Telegram
notifications. The allowlist matches exact addresses without case sensitivity.

## Cross-account ingress secrets

Every ingress Worker needs the same `INGRESS_SECRET` as the central Worker.
When it should also deliver accepted mail to Gmail, configure one or both of
these secrets against the ingress Worker:

| Secret | Purpose |
| --- | --- |
| `MAILROOM_FORWARD_TO` | Fallback verified destination in the domain's Cloudflare account |
| `MAILROOM_FORWARD_TO_BY_DOMAIN` | JSON map from recipient domains to verified destinations in that account |

The ingress Worker submits the signed message to central Mailroom first. It
forwards the original message only after central Mailroom accepts it. Automatic
replies are stored but not forwarded.

```sh
pnpm --filter @mailroom/ingress exec wrangler secret put \
  MAILROOM_FORWARD_TO_BY_DOMAIN --config wrangler.local.jsonc
```

Use the central Worker forwarding secrets only for domains in its own account.
Use the ingress Worker forwarding secrets for domains in another account.

On macOS you can create a random value without printing it:

```sh
openssl rand -hex 32 | pbcopy
```

Paste it into Wrangler's hidden prompt, then save a recoverable copy in a
password manager or the macOS Keychain. Generate another value before setting
the next secret.

## Credentials that do not belong in the Worker

| Credential | Store it in | Why |
| --- | --- | --- |
| Wrangler login | Wrangler's local credential store | Deploys resources and secrets |
| Mailroom API token | macOS Keychain or `MAILROOM_API_TOKEN` in a short-lived process | Connects the CLI and MCP |
| Cloudflare Email Sending token | Gmail SMTP settings or another SMTP client | Sends through `smtp.mx.cloudflare.net` |
| Google authorization | Google Apps Script | Lets the user-owned script read Gmail Sent |

The Cloudflare SMTP token needs `Email Sending: Edit`. Anyone holding it can
send from domains onboarded to the matching account, so create a dedicated
token and never reuse a broad account token.

## Apps Script properties

Script properties belong under the Apps Script project's settings. They are
not source code.

| Property | Example | Secret |
| --- | --- | --- |
| `MAILROOM_URL` | `https://mailroom.example.workers.dev` | No |
| `MAILROOM_SYNC_SECRET` | The value stored as `GMAIL_SYNC_SECRET` | Yes |
| `GMAIL_ACCOUNT` | `owner@gmail.com` | No |
| `GMAIL_FROM_ADDRESSES` | `me@example.com,hello@example.com` | No |

Only add aliases that are configured in Gmail Send As and routed to a Mailroom
inbox. The script checks the MIME `From` header again before importing a
message.

## Check the live configuration without exposing secrets

Connect the CLI, then run:

```sh
mailroom auth status --check --json
mailroom status --json
mailroom operations run domains.list --params '{}' --json
mailroom operations run inboxes.list --params '{}' --json
mailroom operations run routes.list --params '{}' --json
```

The status output reports binding availability and optional features. It never
returns secret values.
