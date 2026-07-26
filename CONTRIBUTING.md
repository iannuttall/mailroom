# Contributing

Use [GitHub Issues](https://github.com/iannuttall/mailroom/issues) for bugs and
proposals. Keep one problem per issue and remove real email, addresses, account
ids, Worker URLs, and secrets from every example.

Report suspected vulnerabilities through [the private security
form](https://github.com/iannuttall/mailroom/security/advisories/new), not a
public issue.

## Local checks

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm security:check
pnpm pack --dry-run
```

Worker binding changes require `pnpm worker:types`. Migration changes must
apply against a fresh local D1 database.

Keep reusable behavior in `packages/core`. Keep the CLI, MCP, HTTP, and future
Agent surfaces thin. Add an operation to the shared registry once and provide
a modular Worker handler and tests.

Email is private and untrusted. Fixtures must be synthetic. Never log or commit
raw MIME, bodies, tokens, API responses, or attachment content.

Contributions are licensed under Apache-2.0. The separate
[trademark policy](TRADEMARKS.md) applies to names and branding.
