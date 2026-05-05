export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CategoriesTable } from "./categories-table";
import { ExportButton } from "./export-button";
import { HELP } from "@/lib/help";

export default async function CostCategoriesPage() {
  const userId = (await headers()).get("x-clerk-user-id");
  const supabase = createAdminClient();

  const { data: caller } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId!)
    .single();

  if (caller?.role !== "admin" && caller?.role !== "accounting" && caller?.role !== "development_lead") {
    redirect("/dashboard");
  }

  const { data: categories } = await supabase
    .from("cost_categories")
    .select("id, name, code, description, display_order, is_active")
    .order("display_order");

  return (
    <div>
      <Header title="Cost Categories" helpContent={HELP.costCategories} />
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Cost Categories</h2>
            <p className="text-muted-foreground mt-1">
              Manage standardized cost classifications used across all projects and budgets.
            </p>
          </div>
          <ExportButton categories={categories ?? []} />
        </div>
        <CategoriesTable categories={categories ?? []} />
      </div>
    </div>
  );
}
