# Privacy

Mailroom is self-hosted. The maintainer of a deployment controls the email,
domains, storage location, retention, access, and connected Cloudflare account.

Mailroom stores:

- original MIME and attachments in R2;
- parsed messages, headers, routes, threads, drafts, and delivery history in D1;
- bounded message documents and metadata in AI Search;
- optional notification text through Telegram.

Workers AI receives message content only when a caller explicitly runs an
automation test or a later enabled automation. The shipped automation is
disabled.

The CLI stores the API token in the macOS Keychain and non-secret Worker profile
metadata in the local user config directory. Environment variables remain
under the user's control.

Self-hosters are responsible for retention, deletion, backups, legal notices,
and access requests for their deployment. Mailroom does not provide a hosted
service or collect telemetry.
