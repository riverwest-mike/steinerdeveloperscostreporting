export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CategoriesTable } from "./categories-table";
import { ExportButton } from "./export-button";

export default async function CostCategoriesPage() {
  const { userId } = await auth();
  const supabase = createAdminClient();

  const { data: caller } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId!)
    .single();

  if (caller?.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: categories } = await supabase
    .from("cost_categories")
    .select("id, name, code, description, display_order, is_active")
    .order("display_order");

  return (
    <div>
      <Header title="Cost Categories" />
      <div className="p-6 space-y-6">
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
