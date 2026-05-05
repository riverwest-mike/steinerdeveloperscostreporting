import type { WorkSheet } from "xlsx";

/**
 * Currency format that matches on-screen "$1,234" / "$(1,234)" rendering.
 */
export const CURRENCY_FMT = '"$"#,##0_);("$"#,##0)';

/**
 * Percentage format with one decimal place — matches "12.3%" rendering.
 */
export const PERCENT_FMT = "0.0%";

/**
 * Freeze the top `rowCount` rows (and optionally the leftmost `colCount` columns)
 * so the header stays visible while scrolling.
 */
export function freezeHeader(ws: WorkSheet, rowCount: number, colCount = 0) {
  const view = {
    state: "frozen",
    xSplit: colCount,
    ySplit: rowCount,
    topLeftCell: cellRef(rowCount, colCount),
    activePane: "bottomRight",
  };
  (ws as WorkSheet & { "!views"?: unknown[] })["!views"] = [view];
}

/**
 * Apply a number format to all cells in the given zero-indexed columns,
 * skipping rows whose first column is empty (gap rows).
 */
export function setColumnFormats(
  ws: WorkSheet,
  startRow: number,
  endRow: number,
  cols: number[],
  fmt: string
) {
  for (let r = startRow; r <= endRow; r++) {
    for (const c of cols) {
      const ref = cellRef(r, c);
      const cell = (ws as Record<string, unknown>)[ref] as
        | { t?: string; v?: unknown; z?: string }
        | undefined;
      if (cell && cell.t === "n") cell.z = fmt;
    }
  }
}

function cellRef(row: number, col: number): string {
  let s = "";
  let n = col;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${s}${row + 1}`;
}
