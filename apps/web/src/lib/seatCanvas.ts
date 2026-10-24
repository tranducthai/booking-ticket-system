/** Default zone colors for the hall designer — distinct enough side by side on a seat map. */
export const ZONE_COLORS = ["#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#2563eb", "#ca8a04", "#dc2626"];

export const cellKey = (r: number, c: number) => `${r}:${c}`;

/** 0 -> "A", 25 -> "Z", 26 -> "AA" — mirrors event-service seat-map/row-label.ts. */
export function rowLetter(index: number): string {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * Same labeling event-service applies on save (seat-map.service.ts
 * labelCanvasSeats): row letters skip seat-less grid rows, seat numbers run
 * left to right and skip aisles. Used to preview labels in the designer.
 */
export function previewLabels(cells: Iterable<string>): Map<string, string> {
  const byRow = new Map<number, number[]>();
  for (const key of cells) {
    const [r, c] = key.split(":").map(Number);
    if (!byRow.has(r)) byRow.set(r, []);
    byRow.get(r)!.push(c);
  }
  const labels = new Map<string, string>();
  [...byRow.keys()]
    .sort((a, b) => a - b)
    .forEach((r, i) => {
      byRow
        .get(r)!
        .sort((a, b) => a - b)
        .forEach((c, n) => labels.set(cellKey(r, c), `${rowLetter(i)}${n + 1}`));
    });
  return labels;
}

/** "#rrggbb" + alpha byte, for the light fill of an available seat in its zone color. */
export function tint(hex: string | null | undefined, alpha = "2e"): string {
  return /^#[0-9a-f]{6}$/i.test(hex ?? "") ? `${hex}${alpha}` : "#e5e7eb";
}
