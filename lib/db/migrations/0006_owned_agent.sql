CREATE TABLE IF NOT EXISTS agent_conversations (
  conversation_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS agent_messages (
  message_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content_text TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  run_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_message_id TEXT NOT NULL DEFAULT '',
  assistant_message_id TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  execution_mode TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  requested_ops_json TEXT NOT NULL DEFAULT '[]',
  used_tools_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  message TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS agent_artifacts (
  artifact_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_workspace_updated
  ON agent_conversations (workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation_created
  ON agent_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation_started
  ON agent_runs (conversation_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run_created
  ON agent_artifacts (run_id, created_at ASC);
