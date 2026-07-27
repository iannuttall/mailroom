# Mailroom documentation

Mailroom is a self-hosted Cloudflare email service with a CLI and a small MCP
surface. It stores email for people and agents. It does not provide a web
inbox.

Start with the deployment guide if this is your first installation. Do not
switch a working domain's MX records until the safe migration guide says to.

## Follow the setup in this order

1. [Deploy the central Worker](deploy.md).
2. [Review every binding, variable, and secret](configuration.md).
3. Connect the CLI and create the Mailroom domain, inbox, and route records.
4. [Connect Gmail](gmail.md) if Gmail will be the human inbox.
5. [Run the acceptance tests](testing.md).
6. [Move an existing mail domain safely](migration.md).

The [troubleshooting guide](troubleshooting.md) covers Worker, Cloudflare,
Gmail SMTP, Apps Script, routing, and synchronization failures.

## Choose the Cloudflare accounts

Use one central Worker when every email domain is in the same Cloudflare
account. This is the easiest setup.

Deploy one small ingress Worker per extra Cloudflare account when domains must
stay separate. Each ingress Worker receives email and sends mail using bindings
owned by its account. It signs inbound MIME to the central Worker and stores no
mailbox state.

## Guides for each job

| Guide | Use it when |
| --- | --- |
| [Deploy Mailroom](deploy.md) | Creating the Cloudflare resources and first Worker |
| [Configure Mailroom](configuration.md) | Checking bindings, variables, secrets, and credentials |
| [Use Gmail](gmail.md) | Forwarding inbound mail, sending through Cloudflare SMTP, and syncing Sent mail |
| [Test an installation](testing.md) | Proving storage, routing, search, Gmail, threading, and failure handling |
| [Move a working domain](migration.md) | Replacing another provider's MX records without losing the rollback path |
| [Fix setup problems](troubleshooting.md) | Diagnosing a failed command, route, SMTP login, or Apps Script run |
| [Guide setup with an agent](agents.md) | Letting an agent operate the terminal or authenticated browser safely |

## Developer references

- [Architecture](architecture.md)
- [Cloudflare Agents SDK integration](agents-sdk-v2.md)

## Cloudflare references

Cloudflare Email Sending is currently a beta service. Check Cloudflare's
current documentation before relying on plan limits or pricing:

- [Email Service documentation](https://developers.cloudflare.com/email-service/)
- [Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Email Service limits](https://developers.cloudflare.com/email-service/platform/limits/)
- [Email Routing setup](https://developers.cloudflare.com/email-service/get-started/route-emails/)
- [Email routing rules and destination addresses](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/)
- [SMTP reference](https://developers.cloudflare.com/email-service/api/send-emails/smtp/)
- [AI Search Wrangler commands](https://developers.cloudflare.com/ai-search/get-started/wrangler/)
