-- Add development_lead to the role constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'project_manager', 'read_only', 'accounting', 'development_lead'));

-- Chat logs: one row per AI chat request, stores the full conversation
CREATE TABLE IF NOT EXISTS chat_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    TEXT,
  messages      JSONB NOT NULL,
  response      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_logs_user_id_idx  ON chat_logs (user_id);
CREATE INDEX IF NOT EXISTS chat_logs_created_at_idx ON chat_logs (created_at DESC);

-- User activity logs: page visits and actions
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  path        TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_activity_logs_user_id_idx   ON user_activity_logs (user_id);
CREATE INDEX IF NOT EXISTS user_activity_logs_created_at_idx ON user_activity_logs (created_at DESC);

-- AI usage logs: token counts and cost per request
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(12, 6) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_user_id_idx    ON ai_usage_logs (user_id);
CREATE INDEX IF NOT EXISTS ai_usage_logs_created_at_idx ON ai_usage_logs (created_at DESC);

-- RLS: only admins can read logging tables
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read chat_logs"
  ON chat_logs FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "Admins can insert chat_logs"
  ON chat_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can read user_activity_logs"
  ON user_activity_logs FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "Admins can insert user_activity_logs"
  ON user_activity_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can read ai_usage_logs"
  ON ai_usage_logs FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "Admins can insert ai_usage_logs"
  ON ai_usage_logs FOR INSERT
  WITH CHECK (true);
