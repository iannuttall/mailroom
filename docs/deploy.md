# Deploy Mailroom

This guide starts with an empty Cloudflare account and ends with a deployed
central Worker, connected CLI, and one Mailroom route. Gmail and public MX
changes come later.

Nothing in the tracked repository points at a real Cloudflare account. Keep it
that way.

## Decide which Cloudflare account owns the mailbox

The central account owns:

- the central Mailroom Worker;
- D1 mailbox state;
- the R2 raw email archive;
- the AI Search instance;
- Workers AI;
- outbound Email Service bindings for domains in that account.

Use one central account when possible. A domain in another account needs the
small ingress Worker described near the end of this guide.

Mailroom can receive mail on Workers Free, although complex email handlers get
more CPU on Workers Paid. Sending to arbitrary recipients currently requires
Workers Paid. Check
[Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
before deployment because Email Sending is still a beta service.

## Install the repository

Requirements:

- Node.js 22.19 or newer;
- pnpm 11;
- a Cloudflare account using Cloudflare DNS for each mail domain;
- Workers Paid if Mailroom must send to arbitrary recipients.

Clone and verify the repository:

```sh
git clone https://github.com/iannuttall/mailroom.git
cd mailroom
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

Build the local CLI:

```sh
pnpm build:package
node dist/cli.js help
```

Examples below use the installed `mailroom` command. Before the first npm
release use `node dist/cli.js` in its place.

## Authenticate Wrangler

Run Wrangler from the package so the documented version is used:

```sh
pnpm --filter @mailroom/worker exec wrangler login
pnpm --filter @mailroom/worker exec wrangler whoami
```

Check the account shown by `whoami`. Stop if it is not the account that should
own the mailbox.

## Create D1, R2, Queue, and AI Search

Choose the D1 location nearest the main user. Omit `--location` if you do not
want to set a hint.

```sh
pnpm --filter @mailroom/worker exec wrangler d1 create mailroom \
  --location weur

pnpm --filter @mailroom/worker exec wrangler r2 bucket create mailroom-raw

pnpm --filter @mailroom/worker exec wrangler queues create mailroom-ingest

pnpm --filter @mailroom/worker exec wrangler ai-search create mailroom \
  --type builtin \
  --hybrid-search \
  --custom-metadata-schema ../../config/ai-search-metadata.json
```

Save the D1 database ID printed by Wrangler. R2 and AI Search use the names in
the commands.

Mailroom uploads compact Markdown search documents through the AI Search Items
binding. The original MIME remains in R2.

## Create a private Wrangler configuration

Copy the tracked template:

```sh
cp apps/worker/wrangler.jsonc apps/worker/wrangler.local.jsonc
```

Edit `apps/worker/wrangler.local.jsonc`:

1. Replace `replace-with-d1-database-id` with the new D1 ID.
2. Confirm the R2 bucket is `mailroom-raw`.
3. Confirm the Queue producer and consumer both use `mailroom-ingest`.
4. Keep the five-minute cron under `triggers.crons`.
5. Confirm the AI Search instance is `mailroom`.
6. Replace `mailroom@example.com` under `allowed_sender_addresses`.
7. Add every address Mailroom may send from and no others.

The local configuration is ignored by Git. Run `git status --short` and confirm
it does not appear before adding any real domain or address.

The [configuration reference](configuration.md) explains every binding and
variable.

## Onboard each sending domain

Open
[Cloudflare Email Sending](https://dash.cloudflare.com/?to=%2F%3Aaccount%2Femail-service%2Fsending)
in the same account. Select `Onboard Domain`, choose the mail domain, and
review the DNS records Cloudflare adds for its return path, SPF, and DKIM.

Email Sending and Email Routing are separate. Onboarding sending does not move
the domain's inbound MX records.

The sender domain must be onboarded before the Worker binding or Gmail SMTP can
send to arbitrary recipients. Cloudflare documents the current flow in its
[Email Sending guide](https://developers.cloudflare.com/email-service/get-started/send-emails/).

## Add the Worker secrets

Generate separate random values for `MAILROOM_API_TOKEN` and `INGRESS_SECRET`.
Store each one through Wrangler:

```sh
pnpm --filter @mailroom/worker exec wrangler secret put MAILROOM_API_TOKEN \
  --config wrangler.local.jsonc

pnpm --filter @mailroom/worker exec wrangler secret put INGRESS_SECRET \
  --config wrangler.local.jsonc
```

`INGRESS_SECRET` is required even if the first deployment has no extra
account.

Optional Gmail and Telegram secrets are added after the central Worker passes
its health check:

```sh
pnpm --filter @mailroom/worker exec wrangler secret put MAILROOM_FORWARD_TO \
  --config wrangler.local.jsonc

pnpm --filter @mailroom/worker exec wrangler secret put \
  MAILROOM_FORWARD_TO_BY_DOMAIN --config wrangler.local.jsonc

pnpm --filter @mailroom/worker exec wrangler secret put GMAIL_SYNC_SECRET \
  --config wrangler.local.jsonc

pnpm --filter @mailroom/worker exec wrangler secret put TELEGRAM_BOT_TOKEN \
  --config wrangler.local.jsonc

pnpm --filter @mailroom/worker exec wrangler secret put TELEGRAM_CHAT_ID \
  --config wrangler.local.jsonc
```

Only set optional secrets that are in use. Empty values are harder to diagnose
than absent optional features.

## Apply the database migration and deploy

Generate types from the private binding configuration:

```sh
pnpm --filter @mailroom/worker exec wrangler types \
  --config wrangler.local.jsonc \
  --env-file .dev.vars.example
```

Apply the migration to the remote D1 database:

```sh
pnpm --filter @mailroom/worker exec wrangler d1 migrations apply mailroom \
  --remote \
  --config wrangler.local.jsonc
```

Review the migration list before confirming. Then deploy:

```sh
pnpm --filter @mailroom/worker exec wrangler deploy \
  --config wrangler.local.jsonc
```

Wrangler prints a `workers.dev` URL. Keep that URL for the CLI and Apps Script.
A custom Worker domain can be added later.

Check the public health endpoint:

```sh
curl --fail --silent --show-error \
  https://mailroom.example.workers.dev/health
```

The response should identify `mailroom` and contain a current time. The health
route does not expose mailbox configuration.

## Connect the local CLI

Run the interactive login:

```sh
mailroom auth login
```

Enter the Worker URL and the exact `MAILROOM_API_TOKEN` value. On macOS the
token is stored in Keychain. The local config stores only the Worker URL and
profile metadata.

Check every binding:

```sh
mailroom auth status --check --json
mailroom status --json
```

The status output should show `database`, `rawEmail`, `ai`, `aiSearch`, and
`email` as `true`.

For a non-interactive machine set `MAILROOM_API_URL` and provide
`MAILROOM_API_TOKEN` only to that process. Do not add the token to a repository
environment file.

## Create the first domain and inbox

Mailroom routing records are separate from Cloudflare DNS and Email Routing.
Create them before sending a real email to the Worker:

```sh
mailroom operations describe domains.upsert
mailroom operations run domains.upsert \
  --params '{"domain":"example.com","fromAddress":"me@example.com","replyTo":"me@example.com"}' \
  --json

mailroom operations describe inboxes.upsert
mailroom operations run inboxes.upsert \
  --params '{"domain":"example.com","localPart":"me","name":"Main inbox"}' \
  --json
```

Copy the returned inbox ID. Create an exact route:

```sh
mailroom operations describe routes.upsert
mailroom operations run routes.upsert \
  --params '{"inboxId":"inb_replace","domain":"example.com","kind":"exact","localPart":"me","enabled":true,"priority":100}' \
  --json
```

List the result:

```sh
mailroom operations run domains.list --params '{}' --json
mailroom operations run inboxes.list --params '{}' --json
mailroom operations run routes.list --params '{}' --json
```

Only add a catch-all when every unmatched address should enter the same inbox:

```sh
mailroom operations run routes.upsert \
  --params '{"inboxId":"inb_replace","domain":"example.com","kind":"catchall","localPart":null,"enabled":true,"priority":100}' \
  --json
```

No public mail moves at this point.

## Configure a domain in another Cloudflare account

Skip this section when the mail domain belongs to the central account.

Authenticate Wrangler to the domain's account. Copy the ingress template:

```sh
cp apps/ingress/wrangler.jsonc apps/ingress/wrangler.local.jsonc
```

Edit the copy:

- give the Worker a unique name;
- set `CENTRAL_MAILROOM_URL` to the central Worker origin;
- set `ALLOWED_FROM_DOMAINS` to the domains in this account;
- restrict `allowed_sender_addresses` to the addresses Mailroom may send from.

Store the same `INGRESS_SECRET` used by the central Worker:

```sh
pnpm --filter @mailroom/ingress exec wrangler secret put INGRESS_SECRET \
  --config wrangler.local.jsonc
```

Generate types and deploy:

```sh
pnpm --filter @mailroom/ingress exec wrangler types \
  --config wrangler.local.jsonc

pnpm --filter @mailroom/ingress exec wrangler deploy \
  --config wrangler.local.jsonc
```

Update the central Mailroom domain with the ingress Worker URL:

```sh
mailroom operations run domains.upsert \
  --params '{"domain":"other-example.com","relayUrl":"https://mailroom-ingress.example.workers.dev"}' \
  --json
```

The account still needs Email Sending onboarding for its own sender domain.

## Stop before changing MX records

The central service is now deployed but inbound DNS is untouched. Configure
Gmail next if it will be the human inbox. Then run every safe test in
[the testing guide](testing.md).

Use [the migration guide](migration.md) for the final Email Routing and MX
change. Do not casually onboard Email Routing on a domain that still depends on
another provider.
