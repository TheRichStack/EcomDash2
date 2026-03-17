ALTER TABLE agent_conversations
  ADD COLUMN summary_text TEXT NOT NULL DEFAULT '';

ALTER TABLE agent_conversations
  ADD COLUMN summary_updated_at TEXT NOT NULL DEFAULT '';
