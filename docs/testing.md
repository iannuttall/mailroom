# Test a Mailroom installation

Run these tests in order. Each phase proves one boundary before the next phase
changes more state.

Use a unique marker in every test subject and body, such as
`mailroom-test-2026-07-26-a`. Unique text makes D1, Gmail, logs, and search easy
to compare.

## Phase 1 checks the repository

Run every local gate:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
pnpm test:package-install
pnpm security:check
```

The security command may report a documented advisory below its failure
threshold. It must still exit successfully and report no leaked credentials.

## Phase 2 checks the deployed Worker

Check the public health route:

```sh
curl --fail --silent --show-error \
  https://mailroom.example.workers.dev/health
```

Check the authenticated bindings:

```sh
mailroom auth status --check --json
mailroom status --json
```

Expected binding state:

| Field | Expected |
| --- | --- |
| `database` | `true` |
| `rawEmail` | `true` |
| Queue | `mailroom-ingest` exists and has the Worker as consumer |
| `ai` | `true` |
| `aiSearch` | `true` |
| `email` | `true` when replies are enabled |

Keep a log tail open during the remaining tests:

```sh
pnpm --filter @mailroom/worker exec wrangler tail \
  --config wrangler.local.jsonc \
  --format pretty
```

Logs may include message IDs and recipient addresses. They must not include
tokens, message bodies, raw MIME, or attachment content.

Check the Queue configuration:

```sh
pnpm --filter @mailroom/worker exec wrangler queues info mailroom-ingest \
  --config wrangler.local.jsonc
```

Confirm the deployed Worker also shows the `*/5 * * * *` scheduled trigger.

## Phase 3 checks Mailroom routing state

List the configured records:

```sh
mailroom operations run domains.list --params '{}' --json
mailroom operations run inboxes.list --params '{}' --json
mailroom operations run routes.list --params '{}' --json
```

Confirm:

- the domain is enabled;
- each intended address has an enabled inbox;
- an exact route uses the correct local part;
- a catch-all exists only when it was requested;
- a domain in another account has the correct ingress `relayUrl`;
- that ingress account has a verified Gmail destination and the matching
  forwarding secret.

Do not start inbound testing while these records are wrong. Cloudflare can
deliver the message to the Worker, but Mailroom cannot finish processing it
until a matching route exists. The raw message and pending job remain in R2 for
retry.

## Phase 4 checks outbound Gmail without moving MX

Complete the Gmail Send As section in [the Gmail guide](gmail.md).

Send a plain-text message from the domain alias to an unrelated external
account. Verify:

- the external account receives it;
- From contains the domain alias;
- Reply-To is correct;
- Gmail Sent contains the message;
- Cloudflare Email Sending logs show the delivery;
- no Mailroom outbound record exists yet if Apps Script is not installed.

Repeat from the Gmail mobile app. The message should still appear in the same
Gmail Sent label.

## Phase 5 checks Gmail Sent synchronization

Install the Apps Script and run `diagnoseMailroomSentSync`.

Send a fresh message from a configured alias and run `syncSentMail`. Then:

```sh
mailroom messages --direction outbound --limit 10 --json
```

Read the imported message:

```sh
mailroom read msg_replace --headers --attachments --json
```

Expected result:

- one outbound record;
- the Gmail alias in From;
- the external recipient;
- the original subject and body;
- a Gmail provider message ID;
- one R2 raw MIME key behind the record.

Run `syncSentMail` again. A normal immediate run checks zero new message IDs.
If Gmail returns an overlap message again, Mailroom's idempotency record must
still keep one stored message.

Check the database directly when debugging:

```sh
pnpm --filter @mailroom/worker exec wrangler d1 execute mailroom \
  --remote \
  --config wrangler.local.jsonc \
  --command "SELECT id, direction, sender, subject, raw_key, provider_message_id, received_at FROM messages ORDER BY received_at DESC LIMIT 10"
```

Use the returned `raw_key` to download a test MIME file:

```sh
pnpm --filter @mailroom/worker exec wrangler r2 object get \
  mailroom-raw/raw/example.com/msg_replace.eml \
  --remote \
  --config wrangler.local.jsonc \
  --file /tmp/mailroom-test.eml
```

Replace the object path with the exact `raw_key`. Do not paste real message
content into an issue or public terminal log.

## Phase 6 checks inbound mail on a low-risk domain

Use a spare or low-risk domain first. Configure Cloudflare Email Routing to
send one exact address to the central Worker or the account's ingress Worker.

Send from an unrelated external account. Confirm:

```sh
mailroom messages --direction inbound --limit 10 --json
mailroom search "mailroom-test-2026-07-26-a" --json
```

Read the message with attachment metadata:

```sh
mailroom read msg_replace --headers --attachments --json
```

Check all of these:

- Mailroom created one unread inbound record;
- R2 briefly created a `pending/inbound/` job and removed it after processing;
- D1 contains its thread and message rows;
- R2 contains the original MIME;
- the Gmail forwarding destination received a copy;
- the original domain recipient is preserved;
- search finds the unique marker;
- the Worker log has no unhandled error.

For a relayed domain, also confirm the ingress log shows a successful central
request before the Gmail forward. Send one automatic-reply fixture and confirm
Mailroom stores it without forwarding it to Gmail.

Send the same raw test message twice only through a controlled integration
test. The ingress idempotency key must prevent a second stored message.

Pause Queue delivery in the Cloudflare dashboard and send one test message.
Confirm Gmail still receives the forwarded copy and R2 retains both the raw
MIME and a `pending/inbound/` job. Resume Queue delivery and confirm one D1
message appears and the pending job disappears.

Repeat with an intentionally missing Mailroom route. Confirm Gmail still
receives the copy and the pending job remains. Add the route, wait up to five
minutes for the scheduled sweep, and confirm the message appears once.

## Phase 7 checks HTML and attachments

Send another inbound message containing:

- a plain-text part;
- an HTML part;
- one small attachment under 1 MiB;
- a unique subject and body marker.

Confirm the message preview is readable, HTML is stored, attachment metadata is
returned only when requested, and the attachment object exists in R2.

Cloudflare currently accepts larger inbound messages than arbitrary-recipient
outbound messages. Keep the first attachment test small and check
[the current limits](https://developers.cloudflare.com/email-service/platform/limits/).

## Phase 8 checks replies and threading

Reply from Gmail using the domain alias. Wait for the Apps Script trigger or
run it manually.

List the outbound record, copy its thread ID, and inspect the thread:

```sh
mailroom operations run messages.thread \
  --params '{"threadId":"thr_replace","limit":20,"includeBodies":false}' \
  --json
```

The inbound message and Gmail reply should share one thread. The reply should
retain `In-Reply-To` and `References`.

Reply once from the other participant and confirm the next inbound message
joins the same thread.

## Phase 9 checks a Mailroom-managed draft

Use a test message with no sensitive content.

Describe each operation before running it:

```sh
mailroom operations describe drafts.create
mailroom operations describe drafts.approve
mailroom operations describe drafts.send
```

Create a draft:

```sh
mailroom operations run drafts.create \
  --params '{"messageId":"msg_replace","subject":"Re: Mailroom test","text":"This is a Mailroom delivery test.","source":"manual"}' \
  --json
```

Read the returned draft in full. Confirm the recipient, sender, subject, body,
and validation. Approve it:

```sh
mailroom operations run drafts.approve \
  --params '{"id":"drf_replace","approvedBy":"installation-test","note":"Recipient and body checked"}' \
  --json
```

Sending changes external state. Run it only after reviewing the stored draft:

```sh
mailroom operations run drafts.send \
  --params '{"id":"drf_replace","idempotencyKey":"installation-test-20260726-0001"}' \
  --json
```

Run the same send command again with the same idempotency key. It must not send
a second message.

## Phase 10 checks the catch-all

Enable a Mailroom catch-all and Cloudflare catch-all only after the exact
address test passes.

Send to a made-up local part such as
`mailroom-random-20260726@example.com`. Confirm it arrives in the intended
inbox and forwards to Gmail.

Then send to a domain address that has an exact route. The exact route should
win over the catch-all.

## Phase 11 checks failure handling

Run controlled failures without exposing a real secret:

- an API request with a fake Mailroom token returns unauthorized;
- a Gmail import signed with a fake secret returns forbidden;
- an inbound address with no exact or catch-all route remains archived and
  pending until the route is added;
- a Gmail From address outside `GMAIL_FROM_ADDRESSES` is skipped;
- an unapproved draft cannot send;
- an already used send idempotency key cannot create another delivery;
- a message over the configured byte limit is rejected;
- removing the forwarding destination does not remove the stored Mailroom copy.
- a relayed message rejected by central Mailroom is not forwarded to Gmail and
  is retried by Email Routing.

Restore every changed secret, route, or destination after the test.

## The installation is ready for MX cutover when

- all repository gates pass;
- Worker health and every binding are good;
- Gmail SMTP works from web and mobile;
- Apps Script imports a new Sent message and has one trigger;
- an exact inbound route works on a low-risk domain;
- raw MIME and a small attachment exist in R2;
- D1, search, forwarding, and threading agree;
- a Mailroom-approved draft sends once;
- the rollback DNS records are recorded.

Only then follow [the migration guide](migration.md).
