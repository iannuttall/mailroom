# Mailroom

Read and reply to project email from your terminal or an AI agent.

Mailroom receives email through Cloudflare, keeps the original MIME in R2,
stores mailbox state in D1, and exposes the same bounded operations through a
CLI, TypeScript API, private HTTP API, and three-tool MCP server. There is no
web inbox.

```sh
npx @iannuttall/mailroom auth login
npx @iannuttall/mailroom messages
npx @iannuttall/mailroom search "sponsorship"
```

The npm package is not published until the first tagged release. Clone the
repository and use `node dist/cli.js` during development.

## What Mailroom does

Cloudflare Email Routing can receive mail for many domains without maintaining
a conventional mailbox. Mailroom gives that mail one private home and makes it
useful to local agents without handing them an unlimited inbox or a send button.

- Exact routes by default, with deliberate catch-all support.
- Raw `.eml` files and attachments in R2.
- Threads, messages, drafts, approvals, and delivery history in D1.
- Hybrid AI Search with D1 full-text fallback.
- Markdown prompts and structured offers.
- Human approval before send.
- A small signed relay for domains on another Cloudflare account.
- Optional Gmail forwarding and Sent-mail synchronization.

## Shape

```txt
Cloudflare Email Routing
          |
          v
central Worker --> R2 raw mail + pending recovery job
       |
       +--> verified Gmail destination
       |
       +--> Queue --> D1 messages, routes, drafts, audit trail
                    R2 attachments
                    AI Search compact semantic retrieval
             ^
             |
       five-minute pending-job sweep
       |
       +--> private operations API
                 |
                 +--> mailroom CLI
                 +--> stdio MCP: list, describe, run
```

For a domain in another Cloudflare account, deploy `apps/ingress` in that
account. It signs inbound MIME to the central Worker and sends outbound mail
locally through that account's Email Service binding. It stores no inbox state.

## Requirements

- Node.js 22.19 or newer
- pnpm 11
- a paid Cloudflare Workers account
- Cloudflare Email Routing and Email Service for each sending account
- D1, R2, Workers AI, and AI Search on the central account

Cloudflare currently requires Workers Paid for Email Sending to arbitrary
recipients. Email Routing is available on Free and Paid. Check
[current Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
because Email Sending is still a beta service.

## Develop

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

The repository enforces an 800 non-blank line limit through Biome. Generated
Wrangler types are tracked but excluded from linting.

Validate the central migration locally:

```sh
pnpm --filter @mailroom/worker exec wrangler d1 migrations apply mailroom --local
```

Neither Worker configuration contains a real account id, database id, domain,
sender, route, or secret. Follow [the deployment guide](docs/deploy.md) before
deploying.

Use [Gmail as the human inbox](docs/gmail.md) without POP. Mailroom can forward
stored inbound mail to a verified Gmail destination, while the included Apps
Script returns manual Gmail Sent messages to the correct Mailroom thread.

## Documentation

The [documentation index](docs/index.md) gives the complete setup order.

| Guide | Covers |
| --- | --- |
| [Deploy Mailroom](docs/deploy.md) | Cloudflare resources, secrets, Worker deployment, CLI, and first route |
| [Configure Mailroom](docs/configuration.md) | Bindings, variables, secrets, tokens, and local state |
| [Use Gmail](docs/gmail.md) | Forwarding, Cloudflare SMTP, Send As, Apps Script, and mobile behavior |
| [Test the installation](docs/testing.md) | Storage, search, routing, threading, Gmail, drafts, and failure tests |
| [Move a mail domain](docs/migration.md) | Safe MX cutover, monitoring, and rollback |
| [Fix setup failures](docs/troubleshooting.md) | Worker, routing, SMTP, and Apps Script errors |
| [Use an installation agent](docs/agents.md) | Terminal and authenticated-browser handoff rules |

## CLI

```txt
mailroom status
mailroom messages [--status unread]
mailroom read <message-id>
mailroom search <query>
mailroom drafts [--status pending]

mailroom operations list
mailroom operations describe <operation-id>
mailroom operations run <operation-id> --params '<json>'

mailroom mcp config
mailroom mcp serve
```

Credentials are stored in the macOS Keychain. The local config contains only
the Worker URL and profile name. `MAILROOM_API_URL` and `MAILROOM_API_TOKEN`
are available for non-interactive environments.

## MCP

Mailroom exposes three tools:

- `mailroom_list_operations`
- `mailroom_describe_operation`
- `mailroom_run_operation`

Agents discover compact operation ids, inspect one schema and its safety
metadata, then run it. Full bodies, threads, attachment metadata, and prompt
bodies are opt-in.

Run `mailroom mcp config` to print a stdio client configuration. The packaged
[`mailroom` skill](skills/mailroom/SKILL.md) teaches the same workflow.

## Safety

Email bodies and attachments are untrusted input. Automation is disabled in
the shipped configuration. Classification tests do not store drafts or send
mail.

Creating a draft, approving it, and sending it are separate operations.
Outbound attempts are recorded before delivery and require an idempotency key.
Quoted prices and links are checked against `config/offers.yaml`.

Secrets belong in Wrangler secrets or the macOS Keychain. Do not put them in
Worker variables, configuration, fixtures, logs, issues, or prompts.

See [SECURITY.md](SECURITY.md) and [PRIVACY.md](PRIVACY.md).

## Repository

- `packages/core`: schemas, operation registry, client, validation, signing
- `packages/cli`: global command and Keychain auth
- `packages/mcp`: local stdio MCP wrapper
- `apps/worker`: central mailbox Worker
- `apps/ingress`: cross-account email relay
- `integrations/gmail-sent-sync`: user-owned Apps Script for manual replies
- `migrations`: D1 schema
- `prompts`: versioned Markdown instructions
- `config`: safe automation, offer, and search metadata examples
- `skills/mailroom`: compact router skill

The [architecture notes](docs/architecture.md) explain the v1 boundaries and
the [v2 note](docs/agents-sdk-v2.md) describes where the Cloudflare Agents SDK
can fit without duplicating mailbox logic.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Bugs and proposals belong in
[GitHub Issues](https://github.com/iannuttall/mailroom/issues). Report security
problems through
[private vulnerability reporting](https://github.com/iannuttall/mailroom/security/advisories/new).

Source code is licensed under [Apache-2.0](LICENSE). The Mailroom name and
branding are covered separately by [TRADEMARKS.md](TRADEMARKS.md).
