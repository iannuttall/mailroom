# Move a working mail domain to Mailroom

Enabling Cloudflare Email Routing changes the domain's MX records. Treat that
as a mail-provider migration, even if the dashboard presents it as onboarding.

Do not make the change until outbound Gmail sending, Gmail Sent sync, Mailroom
storage, and a test-domain inbound route have passed.

## Record the current provider before touching DNS

Save a DNS export or screenshots containing:

- every MX record and priority;
- SPF, DKIM, and DMARC records;
- provider verification records;
- forwarding and catch-all settings;
- every address and alias people still use;
- current mailbox retention or export options.

Write down the exact records needed to restore the old provider. A DNS backup
is only useful if someone can find and understand it while mail is failing.

## Inventory the addresses that must survive

Create a table before cutover:

| Address or pattern | Mailroom inbox | Cloudflare rule | Gmail Send As |
| --- | --- | --- | --- |
| `me@example.com` | Main | Exact or catch-all | Yes |
| `billing@example.com` | Main | Exact or catch-all | Optional |
| `*@example.com` | Main | Catch-all | No |

Create the matching Mailroom domain, inbox, and routes first. A Cloudflare
catch-all and a Mailroom catch-all are separate settings. Both must point at
the intended Worker and inbox.

List the stored state before changing DNS:

```sh
mailroom operations run domains.list --params '{}' --json
mailroom operations run inboxes.list --params '{}' --json
mailroom operations run routes.list --params '{}' --json
```

## Use a low-risk domain for the first inbound test

A spare domain in the same Cloudflare account is the best test. It exercises
the real Email Routing handler, R2, D1, forwarding, and search without risking
an established inbox.

Do not point two competing mail providers at the same priority and hope each
gets a copy. SMTP senders choose an MX host. Split MX configurations make
delivery unpredictable.

## Onboard Email Routing

Open the
[Cloudflare Email Routing dashboard](https://dash.cloudflare.com/?to=%2F%3Aaccount%2Femail-service%2Frouting),
select the account and domain, and review the DNS records Cloudflare plans to
add.

Cloudflare adds MX records for inbound routing plus email authentication
records. Confirm those changes do not delete unrelated verification or DMARC
records.

Create either an exact rule or the domain catch-all:

- Action: `Send to a Worker`
- Worker: the central Mailroom Worker, or the account's ingress Worker

The [Cloudflare routing guide](https://developers.cloudflare.com/email-service/get-started/route-emails/)
shows the current dashboard flow.

## Run the cutover tests immediately

Send from an unrelated external account. Do not use the same Gmail account that
receives the forwarded copy because some providers suppress mail that appears
to loop back to its sender.

Test in this order:

1. An exact address.
2. A made-up address covered by the catch-all.
3. Plain text.
4. HTML.
5. A small attachment.
6. A reply from Gmail using the domain alias.
7. The same reply appearing in Mailroom after the next Apps Script run.

Follow [the acceptance test guide](testing.md) and keep the Worker logs open
during the first messages.

## Watch both delivery surfaces

For each inbound message confirm:

- Mailroom lists one inbound record;
- the raw MIME key exists in R2;
- Gmail receives the forwarded copy;
- the recipient address is the original domain address;
- search finds a unique phrase from the message;
- replies stay in the same Mailroom thread;
- Cloudflare Email Routing reports the event.

Leave the old provider account active while DNS settles. Do not cancel it on
the same day as the MX change.

## Roll back if mail is missing

Disable the Cloudflare routing rule to stop invoking the Worker. Restore the
saved MX and provider authentication records exactly as they were.

DNS caches may continue using the previous MX answer until its TTL expires.
Keep Mailroom and the old provider available during that window. Messages
already accepted by Mailroom remain in D1 and R2.

After rollback inspect Worker logs and the Email Routing activity log before
trying again. Fix the route, binding, destination verification, or forwarding
failure first. Repeating DNS changes without finding the cause makes the next
test harder to interpret.

## Retire the old provider later

Keep the previous provider for several days after the full test matrix passes.
Export any historical mail you still need. Check old aliases, automated
accounts, password resets, and services that use the former SMTP credentials.

Cancel the provider only after normal inbound mail and replies have worked
through Mailroom across desktop and mobile clients.
