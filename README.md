<div align="center">

<img src="assets/mailroom.svg" width="144" alt="Mailroom">

# Mailroom

**Give every project email address one private inbox your agent can use safely.**

Mailroom receives email through Cloudflare and exposes bounded tools for reading, searching, drafting, and replying. Original messages stay archived, and sending always needs a separate approval.

[Start with deployment](docs/deploy.md) ·
[How it works](docs/architecture.md) ·
[Documentation](docs/index.md) ·
[Questions](https://github.com/iannuttall/mailroom/issues) ·
[Security](SECURITY.md) ·
[License](LICENSE) ·
[Agent notes](AGENTS.md)

<a href="https://github.com/iannuttall/mailroom/actions/workflows/ci.yml"><img alt="Checks" src="https://img.shields.io/github/actions/workflow/status/iannuttall/mailroom/ci.yml?branch=main&label=checks&style=flat-square"></a>
<img alt="Node 22.19 or newer" src="https://img.shields.io/badge/Node-22.19%2B-339933?style=flat-square">
<img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-f38020?style=flat-square">
<img alt="TypeScript ready" src="https://img.shields.io/badge/TypeScript-ready-3178c6?style=flat-square">
<img alt="Three MCP tools" src="https://img.shields.io/badge/MCP-3_tools-6f42c1?style=flat-square">
<a href="LICENSE"><img alt="Apache 2.0 license" src="https://img.shields.io/badge/license-Apache--2.0-lightgrey?style=flat-square"></a>

</div>

---

Project email tends to end up in a personal inbox, a shared login, or a service that gives automation far too much access. Mailroom gives the mail one private home and exposes small, named operations instead of an open-ended inbox and send button.

It is built for people who own their domains, are comfortable running Cloudflare infrastructure, and want to use project email from a terminal or local agent. There is no hosted Mailroom account and no web inbox.

## What Mailroom gives you

- Exact email routes by default, with deliberate catch-all support.
- Original `.eml` files and attachments archived in R2.
- Threads, messages, drafts, approvals, and delivery history stored in D1.
- Search through Cloudflare AI Search with a D1 full-text fallback.
- One CLI for normal use and a typed API for scripts.
- Three compact MCP tools that discover and run the same operations.
- A hard boundary between creating a draft, approving it, and sending it.
- Optional Gmail forwarding and Sent-mail synchronization.
- A signed relay for domains owned by another Cloudflare account.

## Start with one mailbox route

Mailroom is self-hosted email infrastructure, so the first setup is more involved than installing a normal CLI. The [deployment guide](docs/deploy.md) starts with an empty Cloudflare account and ends with a live Worker, connected CLI, and one tested route.

Clone the repository and run its checks first:

```sh
git clone https://github.com/iannuttall/mailroom.git
cd mailroom
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build:package
```

Then follow the deployment guide in order:

1. Choose the Cloudflare account that will own the mailbox.
2. Create D1, R2, Queue, and AI Search resources.
3. Add private Worker configuration and secrets.
4. Apply the migration and deploy the central Worker.
5. Connect the CLI and create the first domain, address, and route.
6. Test inbound mail before changing any important MX records.

The npm package is not published until the first tagged release. During development replace `mailroom` in the examples with `node dist/cli.js`.

## Read and search from the terminal

Log in once with the Worker URL and API token:

```sh
mailroom auth login
mailroom status
```

On macOS the token goes into Keychain. The local config stores only the Worker URL and profile name.

Everyday commands stay small and predictable:

```sh
mailroom messages --status unread
mailroom read <message-id>
mailroom search "sponsorship"
mailroom drafts --status pending
```

Non-interactive environments can use `MAILROOM_API_URL` and `MAILROOM_API_TOKEN` instead of Keychain.

## Give an agent bounded email tools

Mailroom does not dump its full API into an agent context. Its MCP server exposes three tools:

- `mailroom_list_operations` discovers compact operation IDs.
- `mailroom_describe_operation` returns one schema and its safety metadata.
- `mailroom_run_operation` validates and runs that operation.

Full message bodies, threads, attachment metadata, and prompt bodies are opt-in. An agent has to ask for the operation it needs rather than receiving the entire mailbox by default.

Print a stdio client configuration with:

```sh
mailroom mcp config
```

Install the packaged Mailroom skill through the standard Skills CLI:

```sh
npx skills add iannuttall/mailroom
```

The skill teaches agents how to search, inspect a message, prepare a draft, request approval, and send only the approved result.

## Sending requires a real approval

Email bodies and attachments are untrusted input. Automation is disabled in the shipped configuration, and classification tests cannot store drafts or send mail.

Creating a draft, approving it, and sending it are separate operations. Outbound attempts are recorded before delivery and require an idempotency key. Quoted prices and links are checked against `config/offers.yaml` so a generated reply cannot invent either one.

Secrets belong in Wrangler secrets or the macOS Keychain. Do not put them in Worker variables, configuration files, fixtures, logs, issues, or prompts. [SECURITY.md](SECURITY.md) covers private vulnerability reporting and the trust boundaries in more detail.

## Keep Gmail as the human inbox

Mailroom can forward stored inbound mail to a verified Gmail destination. The included Apps Script sends manual Gmail replies back to the correct Mailroom thread, so the archive and delivery history stay complete.

This is optional. Mailroom remains the source of mailbox state, while Gmail is the familiar human reading and reply surface. The [Gmail setup guide](docs/gmail.md) covers forwarding, SMTP, Send As, the Sent-mail sync, and mobile behavior.

## How mail moves through the system

```txt
Cloudflare Email Routing
          |
          v
central Worker --> R2 original mail + pending recovery marker
       |
       +--> optional verified Gmail destination
       |
       +--> Queue --> D1 messages, threads, drafts, approvals, audit trail
                    R2 attachments
                    AI Search compact search documents
             ^
             |
       five-minute recovery sweep
       |
       +--> private operations API
                 |
                 +--> mailroom CLI
                 +--> stdio MCP: list, describe, run
```

Domains in another Cloudflare account use the small `apps/ingress` relay. It signs inbound MIME to the central Worker and sends outbound mail through that account's Email Service binding. It stores no inbox state.

The [architecture notes](docs/architecture.md) explain the storage model, recovery path, authentication, search fallback, and account boundaries.

## What you need

- Node.js 22.19 or newer.
- pnpm 11.
- A Cloudflare account using Cloudflare DNS for each mail domain.
- D1, R2, Queues, Workers AI, and AI Search in the central account.
- Cloudflare Email Routing for inbound mail.
- Workers Paid when Mailroom must send to arbitrary recipients.

Cloudflare Email Sending is still a beta service. Check [Cloudflare's current Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/) before deploying.

## Follow the setup in order

The [documentation index](docs/index.md) keeps the setup sequence and account choices in one place.

| Guide | What it helps you finish |
| --- | --- |
| [Deploy Mailroom](docs/deploy.md) | Cloudflare resources, secrets, Worker deployment, CLI login, and the first route. |
| [Configure Mailroom](docs/configuration.md) | Bindings, variables, secrets, tokens, and local state. |
| [Use Gmail](docs/gmail.md) | Forwarding, Cloudflare SMTP, Send As, Apps Script, and mobile behavior. |
| [Test the installation](docs/testing.md) | Storage, search, routing, threading, drafts, Gmail, and failure recovery. |
| [Move a mail domain](docs/migration.md) | A safe MX cutover with monitoring and rollback. |
| [Fix setup failures](docs/troubleshooting.md) | Worker, routing, SMTP, and Apps Script errors. |
| [Use an installation agent](docs/agents.md) | Terminal work, authenticated browser handoffs, and stop conditions. |

## Develop locally

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm test:package-install
pnpm security:check
pnpm pack:check
```

The build includes dry-run deployments for both Workers. The package test checks the public API, CLI, MCP entry point, packaged skill, prompts, integrations, policy files, and clean-install behavior.

The repository is split by runtime boundary:

```text
packages/core                 schemas, operations, validation, signing
packages/cli                  local CLI and Keychain authentication
packages/mcp                  stdio MCP server
apps/worker                   central mailbox Worker
apps/ingress                  cross-account email relay
integrations/gmail-sent-sync  user-owned Apps Script
migrations                    D1 schema
prompts                       versioned agent instructions
config                        safe automation and offer examples
skills/mailroom               packaged agent workflow
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before sending a change. [AGENTS.md](AGENTS.md) records the product contracts and runtime boundaries that are easy to break accidentally.

## Common questions

### Is Mailroom a hosted email service?

No. You deploy it into your own Cloudflare account and keep control of the Worker, storage, domains, and secrets.

### Can an agent send mail without approval?

The shipped configuration does not allow it. Draft creation, approval, and delivery are separate operations, and every outbound attempt is recorded before delivery.

### Does Mailroom replace Gmail?

It can, but it does not have a web inbox. Gmail can remain the human interface while Mailroom keeps the original mail, routing state, search index, agent operations, and audit history.

### Why does Mailroom need a Worker?

The Worker is the mailbox runtime. It receives messages from Cloudflare Email Routing, archives the original MIME, queues processing, exposes the private operations API, and sends approved replies. Unlike a local CLI wrapper, that work has to run where the email arrives.

### Can domains in different Cloudflare accounts share one Mailroom?

Yes. Deploy the signed ingress relay in each additional account. Inbox state still stays in the central account.

## License and project policy

Source code is available under the [Apache 2.0 License](LICENSE). [PRIVACY.md](PRIVACY.md), [TERMS.md](TERMS.md), and [TRADEMARKS.md](TRADEMARKS.md) cover the public project policies.
