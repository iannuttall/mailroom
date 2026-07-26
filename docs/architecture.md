# Architecture

Mailroom has one authoritative mailbox and several thin interfaces.

## Central Worker

`apps/worker` receives email directly from Cloudflare Email Routing or through
a signed relay. It resolves an explicit route before consuming the body.

For accepted mail it:

1. stores the original MIME in R2;
2. parses bounded text, HTML, headers, and attachment metadata;
3. stores attachments in R2;
4. groups the message into a thread in D1;
5. writes a D1 FTS record;
6. indexes canonical Markdown in AI Search in `waitUntil()`;
7. sends an optional Telegram notification.

D1 is authoritative for state. R2 is authoritative for original bytes. AI
Search is a rebuildable retrieval index.

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

## Operation contract

`packages/core/src/operations.ts` registers every operation once. Each record
contains:

- compact discovery metadata;
- use and avoid guidance;
- an outcome;
- safety flags;
- a bounded Zod input schema.

The CLI, private API, MCP server, and future Agent use that contract. The Worker
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
