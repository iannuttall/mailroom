# Architecture

Mailroom has one authoritative mailbox and several thin interfaces.

## Central Worker

`apps/worker` receives email directly from Cloudflare Email Routing or through
a signed relay.

Direct Email Routing delivery uses this order:

1. store the original MIME under `raw/inbound/` in R2;
2. write a small job under `pending/inbound/` in R2;
3. forward the original to the optional verified Gmail destination;
4. add the pending job to the `mailroom-ingest` Queue;
5. acknowledge Cloudflare Email Routing.

The Queue consumer parses the archived MIME, resolves the Mailroom route,
stores attachments, groups the message into a thread, and writes D1 and FTS
records. It deletes the pending job only after the D1 write succeeds.

A scheduled Worker trigger scans `pending/inbound/` every five minutes and
re-enqueues any jobs still present. Queue delivery is idempotent. A unique
inbox and provider-message key prevents concurrent retries from creating a
second message.

AI Search indexing and explicitly allowlisted Telegram notifications run after
the D1 write. Their failure does not remove the raw MIME or parsed message.

D1 is authoritative for state. R2 is authoritative for original bytes. AI
Search is a rebuildable retrieval index.

Gmail forwarding does not wait for parsing, route resolution, D1, AI Search, or
notifications. A forwarding failure leaves the R2 pending job available for
Mailroom. A raw R2 archive failure still attempts Gmail forwarding, then
returns a temporary error so the sender retries delivery.

## Cross-account relay

Cloudflare Email Routing and Email Service bindings belong to the account
where the domain is configured. `apps/ingress` is deployed once in any extra
account.

Inbound delivery is signed over the timestamp, idempotency key, envelope
sender, envelope recipient, and SHA-256 body hash. The central Worker rejects
stale or modified requests.

Outbound delivery is signed over the timestamp, idempotency key, HTTP method,
path, and JSON body hash. The relay enforces an explicit From-domain allowlist
before using its local Email Service binding.

The relay stores no messages, drafts, prompts, or credentials beyond its shared
Wrangler secret.

## Gmail bridge

Gmail can act as a human interface without becoming Mailroom's source of truth.
Inbound messages are forwarded to one verified destination address after
storage.

A standalone Apps Script runs in the Gmail account and reads only the Sent
messages needed for synchronization. It pushes raw MIME to a signed import
endpoint using a separate secret. The Worker checks the signature, configured
mailbox route, exact From address, raw body hash, provider message id, and
idempotency key before storing the message with `direction = outbound`.

The Worker never stores a Google OAuth refresh token. The Apps Script owns
Google authorization and sends only configured From addresses to Mailroom.

## Operation contract

`packages/core/src/operations.ts` registers every operation once. Each record
contains:

- compact discovery metadata;
- use and avoid guidance;
- an outcome;
- safety flags;
- a bounded Zod input schema.

The CLI, private API, MCP server, and Agent wrappers use that contract. The Worker
maps operation ids to modular handlers and has a test that fails when a
registered operation lacks an implementation.

## Sending

A stored inbound message may produce a pending draft. Deterministic validation
checks price and URL claims against structured offers.

Approval changes state but does not send. Sending accepts only an approved
draft and records the idempotency key before calling Email Service or a
cross-account relay. The outbound message is added to the original thread and
indexed like inbound mail.

## Search

Message text is converted into stable Markdown with compact metadata and
uploaded directly through the AI Search Items binding. Search requests use
hybrid retrieval and return snippets and ids.

D1 FTS5 is the fallback when AI Search is unavailable or has not indexed a new
message yet. Neither path returns complete bodies by default.
