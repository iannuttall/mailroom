PRAGMA foreign_keys = ON;

CREATE TABLE domains (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  from_address TEXT,
  reply_to TEXT,
  relay_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE inboxes (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id),
  local_part TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(domain_id, local_part)
);

CREATE TABLE routes (
  id TEXT PRIMARY KEY,
  inbox_id TEXT NOT NULL REFERENCES inboxes(id),
  domain_id TEXT NOT NULL REFERENCES domains(id),
  kind TEXT NOT NULL CHECK (kind IN ('exact', 'catchall')),
  local_part TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (kind = 'exact' AND local_part IS NOT NULL)
    OR (kind = 'catchall' AND local_part IS NULL)
  )
);

CREATE UNIQUE INDEX routes_exact_unique
  ON routes(domain_id, local_part)
  WHERE kind = 'exact';
CREATE UNIQUE INDEX routes_catchall_unique
  ON routes(domain_id)
  WHERE kind = 'catchall';
CREATE INDEX routes_lookup
  ON routes(domain_id, enabled, kind, local_part, priority);

CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  inbox_id TEXT NOT NULL REFERENCES inboxes(id),
  normalized_subject TEXT NOT NULL,
  latest_at TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX threads_subject
  ON threads(inbox_id, normalized_subject, latest_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  inbox_id TEXT NOT NULL REFERENCES inboxes(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL CHECK (status IN ('unread', 'read', 'archived', 'spam')),
  rfc_message_id TEXT,
  in_reply_to TEXT,
  message_references TEXT NOT NULL DEFAULT '[]',
  sender TEXT NOT NULL,
  recipients TEXT NOT NULL,
  cc TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL,
  normalized_subject TEXT NOT NULL,
  preview TEXT NOT NULL,
  text_body TEXT,
  html_body TEXT,
  headers TEXT,
  raw_key TEXT,
  size_bytes INTEGER NOT NULL,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  classification TEXT,
  search_status TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(inbox_id, rfc_message_id)
);

CREATE INDEX messages_inbox_date
  ON messages(inbox_id, received_at DESC, id DESC);
CREATE INDEX messages_thread_date
  ON messages(thread_id, received_at, id);
CREATE INDEX messages_status_date
  ON messages(status, received_at DESC);

CREATE VIRTUAL TABLE message_fts USING fts5(
  message_id UNINDEXED,
  inbox_id UNINDEXED,
  subject,
  sender,
  body,
  classification UNINDEXED,
  tokenize = 'porter unicode61'
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  filename TEXT,
  content_type TEXT,
  content_id TEXT,
  disposition TEXT,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX attachments_message ON attachments(message_id);

CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  thread_id TEXT NOT NULL REFERENCES threads(id),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'approved', 'rejected', 'sending', 'sent', 'failed')
  ),
  recipient TEXT NOT NULL,
  sender TEXT NOT NULL,
  reply_to TEXT,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  html_body TEXT,
  offer_ids TEXT NOT NULL DEFAULT '[]',
  validation TEXT NOT NULL,
  source TEXT NOT NULL,
  prompt_id TEXT,
  prompt_hash TEXT,
  model TEXT,
  provider_message_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX drafts_status_date ON drafts(status, created_at DESC);
CREATE INDEX drafts_thread ON drafts(thread_id, created_at DESC);

CREATE TABLE draft_events (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX draft_events_draft ON draft_events(draft_id, created_at);

CREATE TABLE automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  message_id TEXT NOT NULL REFERENCES messages(id),
  classification TEXT,
  confidence REAL,
  matched INTEGER NOT NULL CHECK (matched IN (0, 1)),
  result TEXT NOT NULL,
  prompt_hash TEXT,
  model TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX automation_runs_message
  ON automation_runs(message_id, created_at DESC);

CREATE TABLE outbound_attempts (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  transport TEXT NOT NULL,
  state TEXT NOT NULL,
  provider_message_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ingress_events (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  recipient TEXT NOT NULL,
  message_id TEXT,
  state TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
