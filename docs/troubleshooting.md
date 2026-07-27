# Fix Mailroom setup problems

Start with the narrowest check that can fail. Do not rotate every credential or
change DNS until the failing boundary is known.

## Check Worker health and CLI authentication

```sh
curl --fail --silent --show-error \
  https://mailroom.example.workers.dev/health

mailroom auth status --check --json
mailroom status --json
```

If `/health` fails, check the Worker URL and deployment. If health works but
the authenticated status fails, the URL is correct and the API token is wrong
or missing.

Run `mailroom auth login` again with the original Worker URL and
`MAILROOM_API_TOKEN`. Do not create a new token until you confirm the stored
value is unavailable.

## Inspect Worker logs

```sh
pnpm --filter @mailroom/worker exec wrangler tail \
  --config wrangler.local.jsonc \
  --format pretty
```

Use one controlled test message while the tail is open. Avoid dumping full
production traffic into a shared terminal.

## Inbound mail is archived but not listed

Mailroom stores Email Routing messages in R2 before parsing or route lookup.
Check Worker logs for:

- `mailroom_queue_enqueue_failed`;
- `mailroom_queue_processing_failed`;
- `mailroom_pending_sweep_enqueued`.

Check the Queue exists and the Worker is its producer and consumer:

```sh
pnpm --filter @mailroom/worker exec wrangler queues info mailroom-ingest \
  --config wrangler.local.jsonc
```

Check the deployed Worker has a five-minute cron trigger in the Cloudflare
dashboard. Pending jobs use `pending/inbound/` in the `mailroom-raw` bucket.
The cron re-enqueues them; do not delete these objects by hand.

Fix the route, parser, D1, or Queue error. The pending job is removed
automatically after the message reaches D1.

## The Worker cannot route inbound mail

An unknown Mailroom route no longer rejects or discards the Email Routing
delivery. The raw message and pending job remain in R2 while the Queue retries.

Check:

```sh
mailroom operations run domains.list --params '{}' --json
mailroom operations run inboxes.list --params '{}' --json
mailroom operations run routes.list --params '{}' --json
```

Common causes:

- the domain record is disabled;
- the inbox local part does not match the address;
- an exact route has the wrong local part;
- the Cloudflare catch-all exists but Mailroom's catch-all does not;
- the route points to a disabled inbox;
- a cross-account domain calls the central Worker instead of its ingress
  Worker.

Fix Mailroom state before changing MX again. The scheduled sweep will retry the
pending message within five minutes.

## Mailroom stores mail but Gmail gets no copy

Check `MAILROOM_FORWARD_TO` or the matching
`MAILROOM_FORWARD_TO_BY_DOMAIN` entry is present and exactly matches a verified
Cloudflare Email Routing destination. The per-domain value must be a JSON object
whose keys are lower-case recipient domains.

Open the
[Email Routing destination list](https://dash.cloudflare.com/?to=%2F%3Aaccount%2Femail-service%2Frouting).
Pending destinations cannot receive forwarded mail. Deleting a destination
also disables routes that use it.

Mailroom archives the raw message before forwarding. Check R2 and the Worker
logs even when no D1 message exists yet.

## Cloudflare reports a temporary Worker delivery failure

Search the Worker logs for `mailroom_email_archive_failed`. This means Mailroom
could not preserve the original MIME or its pending marker in R2.

Mailroom still attempts Gmail forwarding, then throws so the sending mail
server receives a temporary error and retries. Check R2 availability, the
`RAW` binding, the configured size limit, and Worker logs. Do not change MX
while the sender is retrying.

## Gmail SMTP rejects the login

Cloudflare's common SMTP failures are:

| Error | Check |
| --- | --- |
| `535 5.7.8` | Username must be `api_token`; password must be an active Email Sending token |
| `550 5.7.1` | Sender domain is not onboarded in the token's Cloudflare account |
| `552 5.3.4` | MIME body and attachments exceed the outbound size limit |
| TLS failure | Use implicit SSL/TLS on port 465, not STARTTLS on port 587 |

Use a dedicated token with `Email Sending: Edit`. Confirm the From domain and
token belong to the same Cloudflare account.

The
[Cloudflare SMTP troubleshooting table](https://developers.cloudflare.com/email-service/api/send-emails/smtp/#troubleshooting)
contains current response codes.

## Gmail Send As verification never arrives

The verification follows the domain's current MX records.

- Check the old provider when Mailroom has not taken over inbound mail.
- Check the Mailroom destination inbox after Email Routing cutover.
- Check spam in both places.
- Confirm the exact alias has a route or is covered by the catch-all.
- Send from a different account when testing forwarding.

Do not repeatedly delete and recreate the Gmail alias. Find which provider
currently owns the MX path first.

## Apps Script reports zero checked messages

The first run checks only the previous 24 hours. Later runs use a cursor.

Run `diagnoseMailroomSentSync` and check:

- `authorizedAccount` matches `configuredAccount`;
- the test message is under Gmail Sent;
- the test message is newer than 24 hours;
- its actual MIME From address is listed in `GMAIL_FROM_ADDRESSES`;
- the alias was selected in Gmail's From field.

Send one new message after changing a property. Run
`installMailroomSentSync` to reset the cursor and replace the trigger.

The script fetches message IDs and From metadata only inside its time window.
It does not scan the whole mailbox.

## Apps Script cannot decode the Gmail message

These errors mean the script is stale:

```txt
Exception: Could not decode string.
TypeError: value.padEnd is not a function.
```

Apps Script can return Gmail raw MIME as an already decoded byte array. The
current `Code.js` accepts both bytes and a base64 string.

Replace the entire `Code.gs` file with the repository version. Save it, run
`diagnoseMailroomSentSync`, then run `installMailroomSentSync`.

## Apps Script shows a syntax error after selecting a function

The Apps Script editor may still have keyboard focus. Typing a function name
can insert characters into `Code.gs`.

Replace the whole file from a clean repository copy using clipboard paste.
Wait for the saved cloud icon. Use the function dropdown with the mouse or an
accessible option locator rather than typing into it.

## Apps Script receives HTTP 403

The Worker either has no `GMAIL_SYNC_SECRET` or the Apps Script
`MAILROOM_SYNC_SECRET` does not match it.

Set the same random value on both sides. Do not add quotes or trailing spaces.
Run the diagnostic and installer again.

The Mailroom API token does not authenticate Gmail imports.

## Apps Script receives HTTP 404

Set `MAILROOM_URL` to the Worker origin only:

```txt
https://mailroom.example.workers.dev
```

Do not add `/v1/ingress/gmail-sent`. The script appends that route.

Check the origin's `/health` route in a browser or with `curl`.

## Apps Script receives HTTP 400

The MIME, address, message ID, or Mailroom route failed validation.

Check:

- `GMAIL_FROM_ADDRESSES` contains the real From address;
- Mailroom has an enabled domain, inbox, and route for that address;
- `GMAIL_ACCOUNT` matches the authorized Google account;
- the current `Code.js` and `appsscript.json` were pasted together.

Read the execution log, but do not copy raw message content into a public issue.

## The trigger runs more than once

Open Apps Script `Triggers`. Keep exactly one time-based `syncSentMail`
trigger.

Run `installMailroomSentSync` again. It deletes older matching triggers before
creating one five-minute trigger.

Run `uninstallMailroomSentSync` when removing the integration.

## Gmail has the reply but Mailroom does not

Confirm the reply appears in Gmail Sent and uses a configured domain alias.
Then run `syncSentMail` manually.

Check the Apps Script execution log and Mailroom Worker tail together. A failed
import does not advance the cursor, so the next run can retry after the cause
is fixed.

## Mailroom has two copies of one email

Compare:

- RFC `Message-ID`;
- Gmail provider message ID;
- ingress idempotency key;
- inbox ID;
- route and source.

One Gmail message imported through the same account should be deduplicated.
Two separately sent Gmail messages with the same subject and body are different
messages and should both exist.

## Search does not find a new message

Run `mailroom search` first. Mailroom has a D1 full-text fallback while AI
Search indexing catches up.

Check the message's `search_status` in D1 and the Worker log. A search indexing
failure does not remove the stored message or raw MIME.

## A deployment uses the wrong Cloudflare account

Run:

```sh
pnpm --filter @mailroom/worker exec wrangler whoami
```

Stop before applying migrations or secrets. Authenticate to the intended
account and verify the D1 ID, R2 name, AI Search instance, sender addresses,
and domain account again.

Never work around this by placing broad API tokens in Worker variables.

## MX cutover broke mail

Follow [the rollback section](migration.md#roll-back-if-mail-is-missing).
Restore the saved provider MX and authentication records. Keep both services
available while DNS caches expire.
