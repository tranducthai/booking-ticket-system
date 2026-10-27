import type { ArtistStatus } from "../../api/types";

export type ArtistStatusFilterValue = "ALL" | ArtistStatus;

const OPTIONS: Array<{ value: ArtistStatusFilterValue; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: "APPROVED", label: "Đang hoạt động" },
  { value: "PENDING", label: "Đang chờ duyệt" },
  { value: "REJECTED", label: "Bị từ chối" },
];

/** Tất cả / Đang hoạt động / Đang chờ duyệt / Bị từ chối — shared by the admin and organizer artist lists. */
export function ArtistStatusFilter({ value, onChange }: { value: ArtistStatusFilterValue; onChange: (v: ArtistStatusFilterValue) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
            value === o.value ? "border-brand-500 bg-brand-50 text-brand-600" : "border-ink-200 text-ink-600 hover:border-ink-300"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
