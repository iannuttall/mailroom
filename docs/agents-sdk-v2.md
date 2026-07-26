# Agents SDK v2 seam

The Cloudflare Agents SDK can add judgement and multiple turns later. It should
orchestrate the existing operation registry, not become another mailbox.

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

A Cloudflare Workflow is the right later boundary for durable pauses, approval,
timeouts, and retry policy. The Agent can retain conversation state and tool
selection. The Workflow retains process state. Mailroom retains email state.

This separation also keeps local use first-class. Claude, Codex, or another
client can perform the same work through the CLI or three-tool MCP server
without deploying an Agent.
