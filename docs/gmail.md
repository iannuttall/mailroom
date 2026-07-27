# Use Gmail as the human inbox

Gmail can provide the web and mobile interface while Mailroom remains the
authoritative store.

```txt
Inbound:  domain -> Cloudflare Email Routing -> Mailroom -> Gmail
Outbound: Gmail -> Cloudflare SMTP -> recipient
Archive:  Gmail Sent -> Apps Script -> Mailroom
```

This setup does not use POP or IMAP. Messages sent from Gmail web, the Gmail
mobile app, or another Gmail client appear under the same server-side Sent
label and can be synchronized.

Gmail is optional. Mailroom works through its CLI, MCP server, and API without
it.

## Finish the safe prerequisites first

You need:

- a deployed and healthy Mailroom Worker;
- a domain onboarded under Cloudflare Email Sending;
- one Mailroom domain, inbox, and route for each Gmail From address;
- access to the Gmail account that will hold forwarded and Sent messages;
- a verified Cloudflare Email Routing destination address;
- one dedicated Cloudflare Email Sending API token for Gmail SMTP;
- one unrelated random secret for Gmail Sent synchronization.

Do not change a working domain's MX records merely to configure Gmail Send As.
The alias verification message can arrive through the current provider until
the later inbound cutover.

## Verify the Gmail forwarding destination

Open the
[Cloudflare Email Routing dashboard](https://dash.cloudflare.com/?to=%2F%3Aaccount%2Femail-service%2Frouting)
and select the account that owns the central Worker.

Open `Destination Addresses`, add the Gmail address, and submit it. Cloudflare
sends a verification email to Gmail. Open it and verify the destination.

Destination addresses are account-level records and can be reused for domains
in that Cloudflare account. Mailroom can only call `message.forward()` for a
verified destination.

For one destination, store the exact Gmail address as a Worker secret:

```sh
pnpm --filter @mailroom/worker exec wrangler secret put MAILROOM_FORWARD_TO \
  --config wrangler.local.jsonc
```

Redeploying is not required after `wrangler secret put`.

For separate Gmail labels per domain, verify one Gmail plus address for each
domain. Store a JSON object as another Worker secret:

```sh
pnpm --filter @mailroom/worker exec wrangler secret put \
  MAILROOM_FORWARD_TO_BY_DOMAIN --config wrangler.local.jsonc
```

Enter one line in this shape:

```json
{"example.com":"owner+example@gmail.com","second.example":"owner+second@gmail.com"}
```

The domain-specific address takes precedence over `MAILROOM_FORWARD_TO`. Keep
the fallback configured unless every recipient domain has an entry.

In Gmail, create one filter per plus address with `deliveredto:`:

```text
deliveredto:owner+example@gmail.com
```

Apply the matching project label. Gmail does not provide a reliable wildcard
operator for an arbitrary recipient at one domain.

Mailroom stores accepted inbound mail before forwarding it. A forwarding
failure does not remove the D1 or R2 copy.

Forwarding to a verified destination does not consume Cloudflare's
arbitrary-recipient Email Sending quota. Cloudflare documents this exception
under
[Email Routing destination addresses](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/).

## Create a dedicated SMTP token

The sender domain must already be onboarded under
[Cloudflare Email Sending](https://dash.cloudflare.com/?to=%2F%3Aaccount%2Femail-service%2Fsending).

Create an account-owned or user-owned
[Cloudflare API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
with `Email Sending: Edit`. Restrict it to the account that owns the sender
domain. Name it for this Gmail connection so it can be revoked without
affecting Worker deployment.

Copy the token when Cloudflare shows it. The value appears once. Save it in a
password manager until Gmail has accepted it.

Do not use:

- the Global API key;
- the Mailroom API token;
- the Mailroom ingress secret;
- the Gmail Sent sync secret;
- a token belonging to another Cloudflare account.

## Add the address to Gmail Send As

Open
[Gmail Accounts and Import settings](https://mail.google.com/mail/u/0/#settings/accounts)
in the Gmail account that will send the mail.

Under `Send mail as` select `Add another email address`.

Enter the display name and domain address. Keep `Treat as an alias` enabled for
an address you own. Continue to the SMTP form and use:

| Gmail setting | Value |
| --- | --- |
| SMTP server | `smtp.mx.cloudflare.net` |
| Port | `465` |
| Username | `api_token` |
| Password | The dedicated Cloudflare Email Sending token |
| Secured connection | SSL |

Cloudflare SMTP requires implicit TLS on port 465. Port 587 with STARTTLS will
not work. The
[Cloudflare SMTP reference](https://developers.cloudflare.com/email-service/api/send-emails/smtp/)
contains the current connection details and response codes.

Gmail sends a verification message to the new domain address. It follows
whatever inbound provider currently owns the MX records:

- before cutover, check the old provider;
- after Mailroom cutover, check the forwarded Gmail inbox;
- for a new domain, configure a temporary exact inbound route before expecting
  the message.

Open the verification message and select its confirmation link. The alias
should then appear under `Send mail as`.

Choose `Reply from the same address to which the message was sent` in Gmail.
This prevents a reply to `me@example.com` from silently changing to the Gmail
address.

## Prove Gmail SMTP before installing the sync

Compose a new plain-text message:

1. Select the domain alias in Gmail's From field.
2. Send to an unrelated external address.
3. Confirm the recipient sees the domain alias in From.
4. Reply from the recipient and confirm it goes to the intended Reply-To.
5. Open Gmail Sent and confirm the original message is present.
6. Check Cloudflare Email Sending logs for the delivery.

If the message is in Gmail Sent, the later Apps Script can see it. This is true
for mail sent from Gmail web and the Gmail iOS or Android apps.

## Add the Gmail Sent signing secret

Generate a fresh random secret. It must not match any other Mailroom or
Cloudflare credential.

Store it on the Worker:

```sh
pnpm --filter @mailroom/worker exec wrangler secret put GMAIL_SYNC_SECRET \
  --config wrangler.local.jsonc
```

Save a recoverable copy in a password manager or system keychain. Apps Script
needs the same value once.

## Create the Apps Script project

Open [Google Apps Script](https://script.google.com/home) while signed into the
Gmail account that owns the Sent label.

An agent can complete most of these steps through ChatGPT's Chrome extension
or Claude in Chrome. Follow [the agent setup guide](agents.md) to connect the
signed-in tab without sharing the Google password or session cookies.

1. Select `New project`.
2. Rename it to `Mailroom Sent Sync`.
3. Open `Project Settings`.
4. Enable `Show "appsscript.json" manifest file in editor`.
5. Return to `Editor`.
6. Replace `Code.gs` with
   [`integrations/gmail-sent-sync/Code.js`](../integrations/gmail-sent-sync/Code.js).
7. Replace `appsscript.json` with
   [`integrations/gmail-sent-sync/appsscript.json`](../integrations/gmail-sent-sync/appsscript.json).
8. Save the project and wait for the saved cloud icon.

Use full-file clipboard paste in the Apps Script editor. Avoid typing function
names while the code editor has focus because a stray character can corrupt
the first line without being obvious.

## Enable the Gmail advanced service

The project should show `Gmail` under `Services` after the manifest is saved.
If it does not:

1. Select the plus button next to `Services`.
2. Choose `Gmail API`.
3. Keep version `v1`.
4. Use identifier `Gmail`.
5. Select `Add`.

The script requests read-only Gmail access. It cannot delete mail, change
labels, or send through Gmail.

## Add the four Script properties

Open `Project Settings`, scroll to `Script properties`, and select
`Add script property`.

| Property | Value |
| --- | --- |
| `MAILROOM_URL` | Worker origin, such as `https://mailroom.example.workers.dev` |
| `MAILROOM_SYNC_SECRET` | Exact value stored as Worker `GMAIL_SYNC_SECRET` |
| `GMAIL_ACCOUNT` | Gmail account that owns this Apps Script |
| `GMAIL_FROM_ADDRESSES` | Comma-separated Mailroom aliases used in Gmail |

Do not append `/v1/ingress/gmail-sent` to `MAILROOM_URL`. The script adds that
path itself.

Do not quote property values. Remove spaces around comma-separated addresses.
Address comparison is case-insensitive.

## Authorize and diagnose before installing

Return to the editor. Choose `diagnoseMailroomSentSync` in the function
selector and select `Run`.

Google asks for:

- read-only access to Gmail messages and settings;
- permission to call the Mailroom HTTPS endpoint;
- permission for the script to run when the user is absent.

A personal standalone script may show `Google hasn't verified this app`.
Continue only when the project is the one just created from this repository.
Select `Advanced`, continue to `Mailroom Sent Sync`, review the scopes, and
allow them. Never approve a similarly named project owned by somebody else.

Run the diagnostic again after authorization. Its execution log should contain
a small JSON object with:

- `authorizedAccount`;
- `configuredAccount`;
- a Sent message estimate;
- up to ten recent Gmail message IDs;
- message IDs found inside the script's 24-hour lookback.

The two account values must match. The diagnostic does not print the signing
secret or message content.

## Install the recurring sync

Choose `installMailroomSentSync` and select `Run`.

The installer:

1. validates all Script properties;
2. resets the local cursor;
3. removes older `syncSentMail` triggers;
4. creates one five-minute trigger;
5. checks only the previous 24 hours;
6. imports matching configured From aliases.

A successful log looks like:

```txt
Mailroom checked 2 Gmail Sent messages and imported 2 managed messages.
```

Open `Triggers` in Apps Script. Confirm there is exactly one time-based trigger
for `syncSentMail`.

Do not create a second manual trigger. Running the installer again safely
replaces the existing trigger.

## Understand what the script scans

The first run asks Gmail only for Sent messages from the previous 24 hours.
Later runs begin ten minutes before the stored cursor to cover delayed Gmail
indexing. Mailroom's idempotency key prevents a repeated Gmail message from
creating another record.

The script fetches lightweight From metadata first. Raw MIME is retrieved only
when the From address matches `GMAIL_FROM_ADDRESSES`.

It reads at most 20 pages of 100 message IDs in one run. If that bound is hit,
the run fails and the cursor does not advance. It never walks the whole Gmail
mailbox.

Apps Script's advanced Gmail service may expose raw MIME as a byte array rather
than a base64 string. The shipped code accepts both forms. If an older copy
throws `Could not decode string` or `value.padEnd is not a function`, replace
the whole `Code.gs` file with the current repository version.

## Verify the first import

Send another message from a configured Gmail alias. Give it a unique subject.
Run `syncSentMail` manually or wait for the trigger.

Check Mailroom:

```sh
mailroom messages --direction outbound --limit 10 --json
```

The record should contain:

- `direction` set to `outbound`;
- the domain alias under `from`;
- the real recipient;
- the Gmail subject and preview;
- a `receivedAt` value matching the send time.

Run `syncSentMail` immediately again. The cursor should make it report zero
newly checked messages in the normal case. Existing overlap messages may be
offered again after delayed indexing, but Mailroom still stores one record per
Gmail message ID.

Run the wider checks in [the testing guide](testing.md) before removing another
mail provider.

## Add another Gmail From address

For each additional alias:

1. create the Mailroom inbox or route;
2. add the address to `allowed_sender_addresses` in the private Worker config;
3. onboard its domain for Email Sending in the correct Cloudflare account;
4. add and verify the Gmail Send As entry;
5. add the address to `GMAIL_FROM_ADDRESSES`;
6. run `diagnoseMailroomSentSync`;
7. run `installMailroomSentSync`;
8. send and import one test message.

An address in another Cloudflare account uses that account's SMTP token and
ingress Worker. The central Apps Script can still import its Gmail Sent copy
when the central Mailroom route knows the address.

## Rotate or remove the integration

Run `uninstallMailroomSentSync` to delete the recurring trigger.

To rotate the signing secret:

1. create a new random value;
2. replace the Worker `GMAIL_SYNC_SECRET`;
3. replace the Apps Script `MAILROOM_SYNC_SECRET`;
4. run `diagnoseMailroomSentSync`;
5. run `installMailroomSentSync`;
6. verify one new outbound import.

Delete the Script project and Worker secret when Gmail Sent synchronization is
no longer used. Removing Apps Script does not delete existing Mailroom
messages.
