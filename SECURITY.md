# Security

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting:

```txt
https://github.com/iannuttall/mailroom/security/advisories/new
```

Remove messages, addresses, account ids, Worker URLs, D1 and R2 identifiers,
Telegram details, API tokens, and relay signatures from every report.

## Boundaries

- Wrangler secrets hold Worker credentials.
- The macOS Keychain holds the local API token.
- D1 holds parsed mailbox state.
- R2 holds original MIME and attachments.
- AI Search receives bounded canonical message text and metadata.
- Cross-account requests use short-lived HMAC signatures and body hashes.
- Gmail Sent imports use a separate short-lived HMAC signature and exact
  mailbox allowlist.
- Draft approval and send are separate audited operations.

The optional Apps Script owns Google authorization. Mailroom does not store a
Google OAuth refresh token. Rotate `GMAIL_SYNC_SECRET` independently from API,
relay, and Cloudflare SMTP credentials.

Prompts and received email are not trusted authorities. Automation may classify
or draft but is disabled by default and cannot silently send.

## Maintainer checks

Before a release or a change to auth, signing, storage, prompts, or delivery:

```sh
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm security:check
pnpm pack --dry-run
```

Run `pnpm security:check` only in a clean checkout. It scans the repository with
gitleaks and audits high-severity dependency findings.
