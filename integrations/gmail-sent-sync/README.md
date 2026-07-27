# Gmail Sent synchronization

This standalone Google Apps Script returns manual Gmail Send As messages to
Mailroom. Gmail keeps the human web and mobile interface. Mailroom keeps the
complete outbound record and thread.

Follow [the full Gmail setup guide](../../docs/gmail.md) for Cloudflare
forwarding, SMTP, Apps Script clicks, permissions, verification, and testing.
The notes below describe this integration's contract.

## Files

| File | Purpose |
| --- | --- |
| `Code.js` | Source copied into Apps Script as `Code.gs` |
| `appsscript.json` | Apps Script manifest and minimum OAuth scopes |
| `Code.test.mjs` | Local regression tests for query, headers, signatures, and raw MIME handling |

The npm package ships these files unchanged.

## Script properties

| Property | Meaning |
| --- | --- |
| `MAILROOM_URL` | Central Worker origin without an API path |
| `MAILROOM_SYNC_SECRET` | Same value as Worker `GMAIL_SYNC_SECRET` |
| `GMAIL_ACCOUNT` | Google account that owns the Sent label |
| `GMAIL_FROM_ADDRESSES` | Comma-separated Mailroom aliases allowed to import |

The secret belongs in Script properties. Never add it to `Code.js`.

## Entry points

| Function | Use |
| --- | --- |
| `diagnoseMailroomSentSync` | Confirm the Google account and recent bounded Sent IDs |
| `installMailroomSentSync` | Reset the cursor, replace the trigger, and run the first import |
| `syncSentMail` | Run one incremental import |
| `uninstallMailroomSentSync` | Remove every recurring sync trigger |

The installer creates one time-based `syncSentMail` trigger that runs every
five minutes.

## Bounded Gmail access

The first run checks Gmail Sent from the previous 24 hours. Later runs overlap
the stored cursor by ten minutes.

Each page contains at most 100 message IDs. One run processes no more than 20
pages. The script stops and leaves the cursor unchanged when that bound is
exceeded.

For each recent message the script:

1. requests From metadata;
2. skips addresses outside `GMAIL_FROM_ADDRESSES`;
3. requests raw MIME only for an allowed address;
4. verifies the raw MIME From header still matches;
5. signs the body and metadata;
6. posts to `/v1/ingress/gmail-sent`.

Gmail's Apps Script service can return `Message.raw` as a byte array or a
base64url string. `gmailRawBytes()` handles both. Keep its regression tests
when modifying the integration.

## Signed import

The request binds:

- the Gmail account;
- Gmail provider message ID;
- expected Mailroom mailbox;
- raw body SHA-256;
- timestamp;
- idempotency key;
- HMAC signature.

Mailroom rejects stale, changed, unsigned, or wrongly routed messages. The
idempotency key is:

```txt
gmail-sent:<gmail-account>:<gmail-message-id>
```

A repeated import returns success without storing another message.

## OAuth boundary

The manifest grants:

- read-only Gmail access;
- external HTTPS requests;
- permission for the installed trigger to run when the user is absent.

The Worker never receives or stores a Google OAuth token. Google owns the
Apps Script authorization.

## Local checks

```sh
node --test integrations/gmail-sent-sync/Code.test.mjs
pnpm lint
pnpm test
```

After changing `Code.js`, replace the complete live `Code.gs` file and run the
diagnostic and installer again. Do not patch only the failing line in Apps
Script and leave the repository behind.

Browser-assisted installation is documented in
[the agent setup runbook](../../docs/agents.md). Runtime errors and recovery
steps are in [the troubleshooting guide](../../docs/troubleshooting.md).
