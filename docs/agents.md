# Set up Mailroom with an agent

An agent can handle repository changes, Wrangler commands, CLI checks, and most
of the Apps Script editor. The user still owns account selection, consent,
credentials, and the decision to change MX records.

## Read the repository contract first

Before changing setup code or documentation read:

1. `AGENTS.md`
2. `PRODUCT.md`
3. `CONTENT.md`
4. `docs/index.md`
5. the guide for the current setup phase

`CLAUDE.md` is a Git symlink to `AGENTS.md`. Keep one instruction source.

Inspect the current worktree before editing. Existing changes belong to the
user unless the task proves otherwise.

## Separate safe work from account decisions

An agent can proceed with:

- repository inspection and local tests;
- creating ignored Wrangler configuration copies;
- creating D1, R2, and AI Search resources in the account the user selected;
- applying migrations;
- deploying Workers;
- setting a secret through Wrangler's hidden prompt;
- connecting and testing the CLI;
- creating Mailroom domain, inbox, and route records requested by the user;
- operating an authenticated browser after the user connects it;
- pasting the shipped Apps Script and inspecting execution logs.

Stop for the user before:

- choosing between Cloudflare accounts when ownership is unclear;
- replacing existing MX records;
- deleting or overwriting working provider records;
- approving Google permissions in an unfamiliar project;
- creating a catch-all the user did not request;
- sending an external email whose recipient or content was not approved;
- deleting a route, Worker, database, bucket, or secret;
- cancelling the previous mail provider.

Do not widen the task merely because browser or Cloudflare access is available.

## Never expose a secret while helping

Do not print, log, paste into chat, or save:

- Cloudflare API tokens;
- Mailroom API, ingress, or Gmail sync secrets;
- Telegram credentials;
- Google session cookies;
- raw production email;
- attachment contents.

Use Wrangler's hidden `secret put` prompt. Let the user paste a Gmail SMTP token
into Gmail. Let the user paste the Gmail sync secret into Script properties, or
use a local password-manager workflow that does not reveal it in tool output.

Script properties are not source code. Never hard-code
`MAILROOM_SYNC_SECRET` in `Code.gs`.

## Connect the agent to Chrome

Use the signed-in Chrome profile when the user needs help with Cloudflare,
Gmail, or Apps Script.

### ChatGPT and Codex

Install the
[ChatGPT Chrome extension](https://chromewebstore.google.com/detail/chatgpt/hehggadaopoacecdllhhajmbjkdcmajg)
from the Chrome Web Store. In the ChatGPT desktop app, install `Chrome` from
the Plugins Directory if it is not already available.

Start a new ChatGPT Work or Codex conversation and invoke `@Chrome`. Connect
the tab containing the Apps Script project.

Normal Chrome control is enough to navigate Apps Script, replace files, save
the project, select functions, run them, and inspect logs.

ChatGPT's `Developer mode` is separate. Enable it only when console, network,
DOM, performance, or full Chrome DevTools Protocol access is needed. Apps
Script installation does not normally need it. Follow the
[official ChatGPT Chrome guide](https://learn.chatgpt.com/docs/chrome-extension)
for current installation and permission steps.

### Claude

Install
[Claude in Chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome).
Enable the Chrome connector in the Claude Code or Claude Desktop conversation,
then connect the tab containing the Apps Script project.

Grant access only to the sites needed for the task. For this setup that is
normally `script.google.com`, `mail.google.com`, and the Cloudflare dashboard.
Review Anthropic's
[Chrome permission guide](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide)
before allowing broader access.

### Hand over the signed-in tab

Ask the user to:

1. open the exact Apps Script project in the correct Google account;
2. connect the Chrome extension to that tab;
3. confirm the project is safe for the agent to edit.

Use the existing signed-in browser. Do not scrape Chrome profile files, copy
cookies, or ask for the Google password.

When browser control is available:

- inspect the visible page before acting;
- use accessible roles and exact labels;
- confirm a target resolves to one element before clicking;
- take a fresh page snapshot after navigation, save, failure, or dialog;
- leave the project tab open when the handoff is complete.

Google may require the user to approve account consent. Report the requested
scopes plainly and wait for approval.

## Paste Apps Script without corrupting the editor

Apps Script uses the Monaco editor. Keyboard focus is easy to get wrong.

Follow this sequence:

1. Read the complete local `integrations/gmail-sent-sync/Code.js`.
2. Copy the entire file to the browser clipboard.
3. Locate the editor textbox by its accessible name.
4. Click the editor.
5. Select all with the platform shortcut.
6. Paste the full file in one action.
7. Take a fresh page snapshot.
8. Select `Save project to Drive`.
9. Wait until `Unsaved changes` disappears and the save button is disabled.

Do the same for `appsscript.json`.

Do not type a function name while the editor may be focused. A single stray
letter can create a syntax error at line 1. Open the function dropdown and
select the exact option instead.

If source corruption is suspected, paste the full clean file again. Do not
repair a large minified editor buffer one character at a time.

## Verify the Apps Script in a fixed order

Check these visible states:

1. `Code.gs` and `appsscript.json` are present.
2. `Gmail` appears under `Services`.
3. The project is saved.
4. The four Script properties exist.
5. `diagnoseMailroomSentSync` runs under the intended Google account.
6. `installMailroomSentSync` completes.
7. The execution log reports a bounded checked count.
8. The Triggers page shows one time-based `syncSentMail` trigger.
9. `mailroom messages --direction outbound --json` contains the test message.
10. A second immediate `syncSentMail` run does not create another record.

The diagnostic returns account names and Gmail message IDs. It must not return
the secret or message bodies.

## Diagnose from evidence instead of guessing

For Apps Script failures collect:

- selected function;
- execution start and completion time;
- error class and message;
- stack function and line number;
- diagnostic account values;
- checked and imported counts;
- Worker HTTP status.

Do not collect raw MIME or Script property values.

Known fixes are in [the troubleshooting guide](troubleshooting.md). In
particular:

- `Could not decode string` means the script copy is stale;
- `value.padEnd is not a function` means Gmail returned raw bytes to stale
  decoder code;
- a line 1 syntax error usually means a keystroke reached the editor;
- zero checked messages needs the diagnostic, a fresh test email, and account
  verification;
- HTTP 403 means missing or mismatched Gmail sync secrets;
- HTTP 404 usually means `MAILROOM_URL` contains the import path twice.

## Prove the result outside the browser

Browser logs are one side of the test. Check Mailroom independently:

```sh
mailroom status --json
mailroom messages --direction outbound --limit 10 --json
mailroom read msg_replace --headers --attachments --json
```

Run repository tests after changing the shipped integration:

```sh
node --test integrations/gmail-sent-sync/Code.test.mjs
pnpm lint
pnpm typecheck
pnpm test
pnpm pack:check
pnpm test:package-install
pnpm security:check
```

Keep the repository version and live Apps Script version identical. If a live
debug fix changes behavior, update `Code.js`, add a regression test, then paste
the tested file back into Apps Script.

## Hand back a concrete state

Tell the user:

- what is deployed;
- which account and domain were used without exposing IDs unnecessarily;
- which tests passed;
- whether public MX records changed;
- whether a rollback is still available;
- the exact next test;
- which changes remain uncommitted.

Update the durable project note when the setup reaches a new stable state. Do
not save secrets, raw email, or temporary debugging logs.
