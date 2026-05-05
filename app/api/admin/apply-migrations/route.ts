import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Client } from "pg";

const MIGRATION_SQL = `
-- role constraint: include accounting + development_lead (idempotent)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'project_manager', 'read_only', 'accounting', 'development_lead'));

-- Admin monitoring tables (20260312): chat_logs, user_activity_logs, ai_usage_logs
CREATE TABLE IF NOT EXISTS chat_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    TEXT,
  messages      JSONB NOT NULL,
  response      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_logs_user_id_idx    ON chat_logs (user_id);
CREATE INDEX IF NOT EXISTS chat_logs_created_at_idx ON chat_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS user_activity_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  path        TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_activity_logs_user_id_idx    ON user_activity_logs (user_id);
CREATE INDEX IF NOT EXISTS user_activity_logs_created_at_idx ON user_activity_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model              TEXT NOT NULL,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd           NUMERIC(12, 6) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_logs_user_id_idx    ON ai_usage_logs (user_id);
CREATE INDEX IF NOT EXISTS ai_usage_logs_created_at_idx ON ai_usage_logs (created_at DESC);

ALTER TABLE chat_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_logs' AND policyname = 'Admins read chat_logs') THEN
    CREATE POLICY "Admins read chat_logs" ON chat_logs FOR SELECT USING (get_my_role() = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_logs' AND policyname = 'Insert chat_logs') THEN
    CREATE POLICY "Insert chat_logs" ON chat_logs FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_activity_logs' AND policyname = 'Admins read user_activity_logs') THEN
    CREATE POLICY "Admins read user_activity_logs" ON user_activity_logs FOR SELECT USING (get_my_role() = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_activity_logs' AND policyname = 'Insert user_activity_logs') THEN
    CREATE POLICY "Insert user_activity_logs" ON user_activity_logs FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_usage_logs' AND policyname = 'Admins read ai_usage_logs') THEN
    CREATE POLICY "Admins read ai_usage_logs" ON ai_usage_logs FOR SELECT USING (get_my_role() = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_usage_logs' AND policyname = 'Insert ai_usage_logs') THEN
    CREATE POLICY "Insert ai_usage_logs" ON ai_usage_logs FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Cost category override (20260313): manual category edits survive AppFolio sync
ALTER TABLE appfolio_transactions
  ADD COLUMN IF NOT EXISTS cost_category_code_override TEXT,
  ADD COLUMN IF NOT EXISTS cost_category_name_override TEXT,
  ADD COLUMN IF NOT EXISTS cost_category_override_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_category_override_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS appfolio_transactions_category_override_idx
  ON appfolio_transactions (cost_category_code_override)
  WHERE cost_category_code_override IS NOT NULL;

-- transaction_gate_assignments table
CREATE TABLE IF NOT EXISTS transaction_gate_assignments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appfolio_transaction_id UUID NOT NULL UNIQUE REFERENCES appfolio_transactions(id) ON DELETE CASCADE,
  gate_id                 UUID NOT NULL REFERENCES gates(id),
  is_override             BOOLEAN NOT NULL DEFAULT false,
  assigned_by             TEXT REFERENCES users(id),
  assigned_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tga_gate ON transaction_gate_assignments(gate_id);
CREATE INDEX IF NOT EXISTS idx_tga_transaction ON transaction_gate_assignments(appfolio_transaction_id);

ALTER TABLE transaction_gate_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transaction_gate_assignments'
      AND policyname = 'Admins full access on tga'
  ) THEN
    CREATE POLICY "Admins full access on tga"
      ON transaction_gate_assignments FOR ALL TO authenticated
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transaction_gate_assignments'
      AND policyname = 'PMs and read-only can read tga'
  ) THEN
    CREATE POLICY "PMs and read-only can read tga"
      ON transaction_gate_assignments FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transaction_gate_assignments'
      AND policyname = 'PMs can insert/update tga'
  ) THEN
    CREATE POLICY "PMs can insert/update tga"
      ON transaction_gate_assignments FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u WHERE u.id = auth.jwt() ->> 'sub'
            AND u.role IN ('admin', 'project_manager')
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transaction_gate_assignments'
      AND policyname = 'PMs can update tga'
  ) THEN
    CREATE POLICY "PMs can update tga"
      ON transaction_gate_assignments FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u WHERE u.id = auth.jwt() ->> 'sub'
            AND u.role IN ('admin', 'project_manager')
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
`;

/**
 * POST /api/admin/apply-migrations
 *
 * Applies pending database migrations. Tries the following in order:
 * 1. DATABASE_URL env var (Supabase project settings > Database > Connection string)
 * 2. SUPABASE_ACCESS_TOKEN env var (Supabase dashboard > Account > Access Tokens)
 * 3. Returns the SQL with instructions to run manually in the Supabase SQL editor.
 * Admin-only endpoint.
 */
export async function POST() {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  if ((user as { role?: string } | null)?.role !== "admin" && (user as { role?: string } | null)?.role !== "development_lead") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // Attempt 1: pg.Client with explicit DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await client.query(MIGRATION_SQL);
      return NextResponse.json({
        success: true,
        message: "Migrations applied successfully.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    } finally {
      await client.end();
    }
  }

  // Attempt 2: Supabase Management API with SUPABASE_ACCESS_TOKEN
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

  if (accessToken && projectRef) {
    try {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: MIGRATION_SQL }),
        }
      );
      if (res.ok) {
        return NextResponse.json({
          success: true,
          message: "Migrations applied successfully via Supabase Management API.",
        });
      }
      const errBody = await res.text();
      return NextResponse.json(
        { error: `Supabase Management API error (${res.status}): ${errBody}` },
        { status: 500 }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Fallback: return SQL with instructions
  return NextResponse.json(
    {
      error: "No database credentials configured.",
      instructions:
        "Set either DATABASE_URL (Supabase Dashboard → Project Settings → Database → Connection string) " +
        "or SUPABASE_ACCESS_TOKEN (Supabase Dashboard → Account → Access Tokens) in your environment variables, " +
        "then click Apply Pending Migrations again. " +
        "Alternatively, run the SQL below directly in the Supabase SQL Editor.",
      sql: MIGRATION_SQL.trim(),
    },
    { status: 500 }
  );
}
