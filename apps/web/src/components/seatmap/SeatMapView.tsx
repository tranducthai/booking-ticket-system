import clsx from "clsx";
import { useMemo } from "react";
import type { Seat, SeatMapData } from "../../api/types";
import { formatVnd } from "../../lib/format";

const STATUS_STYLE: Record<Seat["status"], string> = {
  AVAILABLE: "bg-white ring-1 ring-inset ring-ink-200 text-ink-700 hover:ring-brand-400 hover:text-brand-600 cursor-pointer",
  HELD: "bg-gold-400/30 text-amber-700 cursor-not-allowed",
  BOOKED: "bg-ink-300 text-white cursor-not-allowed",
  BLOCKED: "bg-ink-100 text-ink-300 cursor-not-allowed line-through",
};

export function SeatMapView({
  seatMap,
  selectedSeatIds,
  onToggleSeat,
}: {
  seatMap: SeatMapData;
  selectedSeatIds: Set<string>;
  onToggleSeat: (seat: Seat) => void;
}) {
  return (
    <div className="space-y-8">
      {seatMap.zones.map((zone) => (
        <div key={zone.id}>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-bold text-ink-800">{zone.name}</h4>
            <span className="text-sm font-semibold text-brand-600">{formatVnd(zone.price)}</span>
          </div>
          {zone.isGeneral ? (
            <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-500">
              Khu vực đứng tự do — sức chứa {zone.capacity ?? "không giới hạn"}. Chọn số lượng ở phần loại vé bên dưới.
            </p>
          ) : (
            <ZoneGrid zone={zone} selectedSeatIds={selectedSeatIds} onToggleSeat={onToggleSeat} />
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-4 border-t border-ink-100 pt-4 text-xs text-ink-500">
        <Legend swatch="bg-white ring-1 ring-inset ring-ink-200" label="Còn trống" />
        <Legend swatch="bg-brand-500" label="Đang chọn" />
        <Legend swatch="bg-gold-400/30" label="Đang được giữ" />
        <Legend swatch="bg-ink-300" label="Đã bán" />
        <Legend swatch="bg-ink-100" label="Không khả dụng" />
      </div>
    </div>
  );
}

function ZoneGrid({
  zone,
  selectedSeatIds,
  onToggleSeat,
}: {
  zone: SeatMapData["zones"][number];
  selectedSeatIds: Set<string>;
  onToggleSeat: (seat: Seat) => void;
}) {
  const rows = useMemo(() => {
    const byRow = new Map<string, Seat[]>();
    for (const seat of zone.seats) {
      if (!byRow.has(seat.row)) byRow.set(seat.row, []);
      byRow.get(seat.row)!.push(seat);
    }
    for (const seats of byRow.values()) seats.sort((a, b) => Number(a.number) - Number(b.number));
    return [...byRow.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [zone.seats]);

  return (
    <div className="overflow-x-auto rounded-xl bg-ink-50/60 p-4">
      <div className="inline-flex min-w-full flex-col items-center gap-1.5">
        {rows.map(([row, seats]) => (
          <div key={row} className="flex items-center gap-1.5">
            <span className="w-5 shrink-0 text-center text-xs font-bold text-ink-400">{row}</span>
            {seats.map((seat) => {
              const selected = selectedSeatIds.has(seat.id);
              const disabled = seat.status !== "AVAILABLE";
              return (
                <button
                  key={seat.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggleSeat(seat)}
                  title={`${row}${seat.number} · ${seat.status}`}
                  className={clsx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold transition-colors",
                    selected ? "bg-brand-500 text-white" : STATUS_STYLE[seat.status],
                  )}
                >
                  {seat.number}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={clsx("h-3 w-3 rounded", swatch)} />
      {label}
    </span>
  );
}
