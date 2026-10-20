/**
 * Vietnam's administrative units after the 2025 reform — 34 provinces/cities,
 * each directly split into wards/communes (no district level). Snapshot of
 * https://provinces.open-api.vn/api/v2/?depth=2 trimmed to names
 * (data/vn-admin-units.json, ~50 KB) and loaded lazily so it only ships with
 * the event-creation wizard, not the main bundle.
 */
export interface Province {
  /** e.g. "Thành phố Hà Nội" */
  n: string;
  /** ward/commune names, e.g. "Phường Ba Đình" */
  w: string[];
}

let cache: Promise<Province[]> | null = null;

export function loadProvinces(): Promise<Province[]> {
  cache ??= import("../data/vn-admin-units.json").then((m) => m.default as Province[]);
  return cache;
}
