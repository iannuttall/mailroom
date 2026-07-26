# Content

Use this guide for the README, command help, error messages, documentation, MCP
tool descriptions, and setup instructions.

## Lead with the job

State what the user can do, then show the shortest command. Explain Worker,
D1, R2, MCP, or Agents SDK only when that detail helps with the current task.

## Keep terms consistent

- Mailroom is the product.
- `mailroom` is the command.
- An operation is a registered unit of work available through the library,
  CLI, API, and MCP server.
- A message is one inbound or outbound email.
- A thread groups related messages.
- A draft cannot send until its status and permissions allow it.
- An automation may classify or draft. It does not silently send.

## Write for agents and people

Human command output should be short and readable. JSON mode must never prompt
or contain terminal decoration.

Agent-facing descriptions should say when to use an operation, what it returns,
and what it can change. Full bodies, threads, attachments, and raw MIME stay
behind explicit parameters.

## Voice

Use plain English and short paragraphs. Skip marketing claims. Do not use em
dashes, filler openers, or vague words such as "seamless" and "robust".

Error messages should name the failed action and a useful next step. Do not
print secrets, full raw messages, or remote response bodies that may contain
private email.
