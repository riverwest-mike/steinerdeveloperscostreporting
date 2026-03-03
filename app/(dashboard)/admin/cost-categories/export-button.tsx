"use client";

import { utils, writeFile } from "xlsx";

interface Category {
  code: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

export function ExportButton({ categories }: { categories: Category[] }) {
  function handleExport() {
    const rows = categories.map((c) => ({
      "Cost Code": c.code,
      "Cost Name": c.name,
      "Cost Category": c.description ?? "",
      "Display Order": c.display_order,
      Status: c.is_active ? "Active" : "Inactive",
    }));

    const ws = utils.json_to_sheet(rows);

    // Column widths
    ws["!cols"] = [
      { wch: 12 }, // Cost Code
      { wch: 45 }, // Cost Name
      { wch: 35 }, // Cost Category
      { wch: 14 }, // Display Order
      { wch: 10 }, // Status
    ];

    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Cost Categories");

    writeFile(wb, "cost-categories.xlsx");
  }

  return (
    <button
      onClick={handleExport}
      disabled={categories.length === 0}
      className="rounded border px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-accent transition-colors"
    >
      Export to Excel
    </button>
  );
}
