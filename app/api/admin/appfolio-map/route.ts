/**
 * GET  /api/admin/appfolio-map
 *   Returns all Supabase projects alongside AppFolio properties,
 *   with auto-suggested matches by name similarity.
 *
 * POST /api/admin/appfolio-map
 *   Body: { updates: [{ id: "<project-uuid>", appfolio_property_id: "149" }] }
 *   Applies the mapping to the projects table.
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  if (user?.role !== "admin" && user?.role !== "accounting") return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  return { userId };
}

// ── AppFolio properties (fetched once via /api/appfolio/properties) ──────────
const APPFOLIO_PROPERTIES = [
  { id: 160, name: "105 Lake Street" },
  { id: 148, name: "15 Flax, LLC" },
  { id: 135, name: "15 West Cherry" },
  { id: 126, name: "168 E. Central" },
  { id: 120, name: "174 Lake" },
  { id: 128, name: "201 E Winter Street" },
  { id: 139, name: "205 E. Central" },
  { id: 140, name: "249 E. Central" },
  { id: 138, name: "28 Estelle" },
  { id: 119, name: "28 Oak" },
  { id: 192, name: "28 Parsons, LLC" },
  { id: 125, name: "31 Smith" },
  { id: 122, name: "349 E. Central" },
  { id: 124, name: "351 E. Central" },
  { id: 118, name: "360 E. Central" },
  { id: 130, name: "37 Carlisle Avenue" },
  { id: 123, name: "50 Fair" },
  { id: 129, name: "55 Chamberlain Street" },
  { id: 180, name: "56 East Main, LLC" },
  { id: 121, name: "58 Flax" },
  { id: 142, name: "60 Lake St, LLC" },
  { id: 131, name: "65 East William" },
  { id: 134, name: "697 East Broad" },
  { id: 159, name: "860-870 S Parsons, LLC" },
  { id: 127, name: "97 Lake Street" },
  { id: 137, name: "Arbor Village Condominium Association" },
  { id: 133, name: "Arlington Pointe" },
  { id: 141, name: "Austin Manor" },
  { id: 166, name: "Berkshire Campground Party House LLC (DO NOT USE)" },
  { id: 144, name: "Berkshire Campground, LLC" },
  { id: 185, name: "Berkshire Party House, LLC" },
  { id: 176, name: "Bridgeview Estates FKA Waterford Glen" },
  { id: 167, name: "Celina Campground Assets, LLC" },
  { id: 193, name: "Celina Investors, LLC" },
  { id: 132, name: "Country Village" },
  { id: 145, name: "Exflax, LLC" },
  { id: 136, name: "Flats of Clintonville" },
  { id: 171, name: "Forest Hills" },
  { id: 179, name: "Huron MHP" },
  { id: 187, name: "Kozy Camping Resort, LLC" },
  { id: 190, name: "Kozy Restaurant, LLC" },
  { id: 184, name: "Lost Peninsula Port, LLC" },
  { id: 175, name: "Mohawk Estates" },
  { id: 168, name: "Morris MHP" },
  { id: 177, name: "Oakwood Acres" },
  { id: 188, name: "Paradise Point Camping Resort, LLC" },
  { id: 189, name: "Park Grand Camping Resort, LLC" },
  { id: 162, name: "Parsons Storage" },
  { id: 146, name: "Pine Creek Campground Holding, LLC" },
  { id: 155, name: "Pine Creek Campground, LLC" },
  { id: 147, name: "Pine Grove Camping Resort, LLC" },
  { id: 196, name: "Port Buckeye Development" },
  { id: 173, name: "Quarry's Edge FKA Colony Village" },
  { id: 149, name: "RiverWest Construction" },
  { id: 150, name: "RiverWest Development, LLC" },
  { id: 151, name: "RiverWest Management" },
  { id: 152, name: "RiverWest Partners" },
  { id: 181, name: "RW DevCo, LLC" },
  { id: 164, name: "RWES II Topcon" },
  { id: 163, name: "RWES, LLC" },
  { id: 153, name: "RWMM, LLC" },
  { id: 165, name: "RWSPP Topcon" },
  { id: 170, name: "Shelby" },
  { id: 182, name: "Steiner Developers, LLC" },
  { id: 178, name: "Sunnyview Estates" },
  { id: 9,   name: "The Mill on Flax" },
  { id: 154, name: "Twin Lakes Campground, LLC" },
  { id: 172, name: "Valley" },
  { id: 158, name: "Vetter Property Group, LLC" },
  { id: 156, name: "Western Reserve Campground, LLC" },
  { id: 169, name: "Will-O-Brook" },
];

// ── Name normalisation for fuzzy matching ────────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(llc|inc|the|fka|do not use)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

function bestMatch(projectName: string) {
  let best = { id: 0, name: "", score: 0 };
  for (const prop of APPFOLIO_PROPERTIES) {
    const score = similarity(projectName, prop.name);
    if (score > best.score) best = { ...prop, score };
  }
  return best.score >= 0.4 ? best : null;
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET() {
  const check = await requireAdmin();
  if (check instanceof NextResponse) return check;

  const supabase = createAdminClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, code, appfolio_property_id")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (projects ?? []).map((p: { id: string; name: string; code: string; appfolio_property_id: string | null }) => {
    const match = bestMatch(p.name);
    return {
      project_id: p.id,
      project_name: p.name,
      project_code: p.code,
      current_appfolio_id: p.appfolio_property_id,
      suggested_appfolio_id: match ? String(match.id) : null,
      suggested_appfolio_name: match?.name ?? null,
      match_score: match ? Math.round(match.score * 100) : 0,
    };
  });

  return NextResponse.json({ projects: rows, appfolio_properties: APPFOLIO_PROPERTIES });
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const check = await requireAdmin();
  if (check instanceof NextResponse) return check;

  const body = await req.json();
  const updates: { id: string; appfolio_property_id: string | null }[] = body.updates ?? [];

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "Body must be { updates: [{id, appfolio_property_id}] }" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const u of updates) {
    const { error } = await supabase
      .from("projects")
      .update({ appfolio_property_id: u.appfolio_property_id })
      .eq("id", u.id);
    results.push({ id: u.id, ok: !error, error: error?.message });
  }

  const failed = results.filter(r => !r.ok);
  return NextResponse.json({ updated: results.length - failed.length, failed });
}
