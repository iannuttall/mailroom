# Add the Cloudflare Agents SDK

Use the Cloudflare Agents SDK for multi-turn email workflows. Call the existing
operation registry instead of creating a second mailbox implementation.

An Agent may:

1. list unread message summaries;
2. read a selected thread;
3. search for similar approved replies;
4. load the relevant prompt and structured offer;
5. classify the enquiry;
6. create a pending draft;
7. request approval through Telegram or a Workflow;
8. call the existing approve and send operations.

The Agent must not own D1 tables, routing, prompt storage, offer validation,
idempotency, or delivery. Those remain in core and the central Worker.

Use a Cloudflare Workflow for durable pauses, approval, timeouts, and retry
policy. The Agent retains conversation state and tool selection. The Workflow
retains process state. Mailroom retains email state.

Claude, Codex, and other local clients can perform the same operations through
the CLI or three-tool MCP server without a deployed Agent.
