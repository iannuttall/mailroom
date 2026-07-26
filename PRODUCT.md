# Product

## Name

The product name is Mailroom. The command and binary are `mailroom`. The public
npm package is `@iannuttall/mailroom`.

Public copy should usually explain the job before naming the product. "Read and
reply to your project email from an agent" is more useful than a paragraph
describing the architecture.

## Users

Mailroom has three first-class users.

- People who want one private place for email across several domains.
- AI agents that need bounded tools for reading, searching, drafting, and
  replying.
- Developers who want to self-host the Worker or use the TypeScript API.

Every surface uses the same operation registry and returns the same structured
result.

## Purpose

Mailroom receives project email through Cloudflare, stores the original
message, and makes it available through a CLI, an MCP server, and a private API.
It is useful without an AI model. Agents add judgement where a fixed rule would
be too brittle.

The Worker owns mailbox state. R2 holds the original email and attachments. D1
holds parsed messages, threads, routes, drafts, approvals, and delivery history.

## Product rules

- No web inbox in v1.
- No required third-party email provider outside Cloudflare.
- A human or explicitly authorised agent approves outbound drafts.
- Search and discovery return compact results before full content.
- Raw email is never included unless the caller asks for it.
- Prompts are Markdown. Prices, links, limits, and expiry dates are structured
  configuration.
- One public npm package contains the library, CLI, MCP server, prompts, and
  agent skill.

## Agents SDK

The Cloudflare Agents SDK is a future orchestration layer. An Agent can inspect
threads, search similar replies, call several Mailroom operations, and pause a
Workflow for approval. It must not become a second mailbox implementation.

## Personality

Direct, private, predictable. Email infrastructure is already fiddly enough.
The product should make each state and next action obvious.
