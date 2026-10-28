
CREATE TABLE IF NOT EXISTS school_conversations (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  title TEXT,
  type TEXT NOT NULL CHECK (type IN ('DIRECT', 'GROUP')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_conversation_members (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_read_at TEXT,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id)
    REFERENCES school_conversations(id)
);

CREATE TABLE IF NOT EXISTS school_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id)
    REFERENCES school_conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_school_conversations_school
  ON school_conversations(school_id);

CREATE INDEX IF NOT EXISTS idx_school_members_user
  ON school_conversation_members(user_id);

CREATE INDEX IF NOT EXISTS idx_school_messages_conversation
  ON school_messages(conversation_id, created_at);
