/** 0 -> "A", 25 -> "Z", 26 -> "AA", 27 -> "AB"... (spreadsheet-column style). */
export function rowLabel(index: number): string {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}
