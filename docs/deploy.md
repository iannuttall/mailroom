# Deploy

Nothing in the repository points at a real Cloudflare account. Complete these
steps deliberately for the central account, then repeat the small relay section
for any other account.

## Central resources

Authenticate Wrangler to the intended Cloudflare account. If Wrangler offers
more than one account, select the account that will own the central mailbox.

Create the storage resources:

```sh
pnpm --filter @mailroom/worker exec wrangler d1 create mailroom
pnpm --filter @mailroom/worker exec wrangler r2 bucket create mailroom-raw
pnpm --filter @mailroom/worker exec wrangler ai-search create mailroom \
  --type builtin \
  --hybrid-search \
  --custom-metadata-schema ../../config/ai-search-metadata.json
```

Replace the placeholder D1 `database_id` in
`apps/worker/wrangler.jsonc`. Check that the bucket and AI Search names match
the resources Cloudflare created.

Replace `mailroom@example.com` in `allowed_sender_addresses` with every
verified address this central account may send from. Keep the binding
restricted.

Generate two different long random values and store them as secrets:

```sh
pnpm --filter @mailroom/worker exec wrangler secret put MAILROOM_API_TOKEN
pnpm --filter @mailroom/worker exec wrangler secret put INGRESS_SECRET
```

Telegram is optional:

```sh
pnpm --filter @mailroom/worker exec wrangler secret put TELEGRAM_BOT_TOKEN
pnpm --filter @mailroom/worker exec wrangler secret put TELEGRAM_CHAT_ID
```

Regenerate types, apply the migration, and deploy:

```sh
pnpm --filter @mailroom/worker generate-types
pnpm --filter @mailroom/worker exec wrangler d1 migrations apply mailroom --remote
pnpm --filter @mailroom/worker run deploy
```

Add a custom Worker route such as `mailroom.your-domain.example` or use the
assigned `workers.dev` URL. This HTTPS endpoint is the CLI API and the target
for signed ingress Workers. Keep the API token private.

## Configure Mailroom routes

Cloudflare Email Routing sends mail to a Worker, but Mailroom also needs its
own explicit domain, inbox, and route records.

After connecting the CLI, run:

```sh
mailroom operations describe domains.upsert
mailroom operations run domains.upsert --params '{"domain":"example.com"}'

mailroom operations describe inboxes.upsert
mailroom operations run inboxes.upsert \
  --params '{"domain":"example.com","localPart":"ian","name":"Ian"}'
```

Use the returned inbox id with `routes.upsert`. Configure the matching
Cloudflare Email Routing rule to invoke the central Worker. Do not create a
Mailroom catch-all unless you actually want one.

## Extra Cloudflare account

Edit `apps/ingress/wrangler.jsonc`:

- give the Worker a unique name;
- set `CENTRAL_MAILROOM_URL`;
- set `ALLOWED_FROM_DOMAINS`;
- replace `allowed_sender_addresses` with verified From addresses.

Store the same relay secret used as `INGRESS_SECRET` on the central Worker:

```sh
pnpm --filter @mailroom/ingress exec wrangler secret put INGRESS_SECRET
pnpm --filter @mailroom/ingress generate-types
pnpm --filter @mailroom/ingress run deploy
```

Route inbound domain addresses to this Worker in that account. In Mailroom,
set the domain's `relayUrl` to the ingress Worker's HTTPS URL. The central
Worker then uses that account for outbound mail from the domain.

## Local client

```sh
mailroom auth login
mailroom status
```

`auth login` asks for the Worker URL and API token, verifies the connection,
stores the token in the macOS Keychain, and writes only non-secret profile
metadata to the local config file.
