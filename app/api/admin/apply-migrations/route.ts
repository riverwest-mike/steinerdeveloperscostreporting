import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Client } from "pg";

const MIGRATION_SQL = `
-- accounting role: add 'accounting' to users_role_check constraint (idempotent)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'project_manager', 'read_only', 'accounting'));

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
 * Applies pending database migrations. Requires DATABASE_URL env var
 * (available from Supabase project settings > Database > Connection string).
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

  if ((user as { role?: string } | null)?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json(
      {
        error: "DATABASE_URL environment variable is not set.",
        instructions:
          "Add DATABASE_URL to your environment variables. " +
          "Find it in Supabase Dashboard > Project Settings > Database > " +
          "Connection string (URI format). " +
          "Alternatively, run the migration SQL manually in the Supabase SQL editor.",
        sql: MIGRATION_SQL.trim(),
      },
      { status: 500 }
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query(MIGRATION_SQL);
    return NextResponse.json({
      success: true,
      message: "Migration applied successfully. transaction_gate_assignments table is ready.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await client.end();
  }
}
