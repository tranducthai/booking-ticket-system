import clsx from "clsx";
import { useMemo } from "react";
import type { Seat, SeatMapData, TicketType } from "../../api/types";
import { formatVnd } from "../../lib/format";
import { cellKey, tint } from "../../lib/seatCanvas";

const STATUS_STYLE: Record<Seat["status"], string> = {
  AVAILABLE: "bg-white ring-1 ring-inset ring-ink-200 text-ink-700 hover:ring-brand-400 hover:text-brand-600 cursor-pointer",
  HELD: "bg-gold-400/30 text-amber-700 cursor-not-allowed",
  BOOKED: "bg-ink-300 text-white cursor-not-allowed",
  BLOCKED: "bg-ink-100 text-ink-300 cursor-not-allowed line-through",
};

export interface StandingSelection {
  /** The event's ticket types — standing zones are sold through theirs (zone.ticketTypeId). */
  ticketTypes: TicketType[];
  /** ticketTypeId -> quantity chosen */
  quantities: Record<string, number>;
  onQuantityChange: (ticketTypeId: string, quantity: number) => void;
}

export function SeatMapView({
  seatMap,
  selectedSeatIds,
  onToggleSeat,
  standing,
}: {
  seatMap: SeatMapData;
  selectedSeatIds: Set<string>;
  onToggleSeat: (seat: Seat) => void;
  standing: StandingSelection;
}) {
  if (seatMap.canvas) return <HallView seatMap={seatMap} selectedSeatIds={selectedSeatIds} onToggleSeat={onToggleSeat} standing={standing} />;
  return (
    <div className="space-y-8">
      {seatMap.zones.map((zone) => (
        <div key={zone.id}>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-bold text-ink-800">{zone.name}</h4>
            <span className="text-sm font-semibold text-brand-600">{formatVnd(zone.price)}</span>
          </div>
          {zone.isGeneral ? (
            <StandingZoneRow zone={zone} standing={standing} />
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

/**
 * A hall drawn in the organizer's designer: the stage on top, every seat on
 * its own cell (empty cells are aisles), painted in its zone's color —
 * cinema-style picking. Selected seats turn brand-colored; held/sold ones
 * are greyed and unclickable.
 */
function HallView({
  seatMap,
  selectedSeatIds,
  onToggleSeat,
  standing,
}: {
  seatMap: SeatMapData;
  selectedSeatIds: Set<string>;
  onToggleSeat: (seat: Seat) => void;
  standing: StandingSelection;
}) {
  const canvas = seatMap.canvas!;
  const { byCell, rowLabels } = useMemo(() => {
    const cells = new Map<string, { seat: Seat; zone: SeatMapData["zones"][number] }>();
    const labels = new Map<number, string>();
    for (const zone of seatMap.zones) {
      for (const seat of zone.seats) {
        if (seat.gridRow == null || seat.gridCol == null) continue;
        cells.set(cellKey(seat.gridRow, seat.gridCol), { seat, zone });
        labels.set(seat.gridRow, seat.row);
      }
    }
    return { byCell: cells, rowLabels: labels };
  }, [seatMap.zones]);
  const seated = seatMap.zones.filter((z) => !z.isGeneral);
  const standingZones = seatMap.zones.filter((z) => z.isGeneral);
  const SIZE = 26;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {seated.map((z) => (
          <span key={z.id} className="flex items-center gap-2 text-sm">
            <span className="h-4 w-4 rounded border-2" style={{ background: tint(z.color), borderColor: z.color ?? "#9ca3af" }} />
            <span className="font-semibold text-ink-800">{z.name}</span>
            <span className="text-ink-500">{formatVnd(z.price)}</span>
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-ink-50/70 p-4 sm:p-6">
        <div className="mx-auto w-max">
          <div
            className="mx-auto mb-6 rounded-b-[48px] rounded-t-md bg-gradient-to-b from-ink-700 to-ink-900 py-2.5 text-center text-xs font-bold tracking-[0.35em] text-white shadow"
            style={{ width: Math.max(160, canvas.cols * (SIZE + 4) * 0.7) }}
          >
            {canvas.stageLabel}
          </div>
          {Array.from({ length: canvas.rows }, (_, r) => (
            <div key={r} className="flex items-center gap-1 py-0.5">
              <span className="w-6 shrink-0 text-center text-[11px] font-bold text-ink-400">{rowLabels.get(r) ?? ""}</span>
              {Array.from({ length: canvas.cols }, (_, c) => {
                const hit = byCell.get(cellKey(r, c));
                if (!hit) return <span key={c} style={{ width: SIZE, height: SIZE }} className="shrink-0" />;
                const { seat, zone } = hit;
                const selected = selectedSeatIds.has(seat.id);
                const available = seat.status === "AVAILABLE";
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={!available}
                    onClick={() => onToggleSeat(seat)}
                    title={`Ghế ${seat.row}${seat.number} · ${zone.name} · ${formatVnd(zone.price)}`}
                    className={clsx(
                      "flex shrink-0 items-center justify-center rounded-t-lg rounded-b-sm border-2 text-[10px] font-bold transition-transform",
                      selected && "scale-110 border-brand-600 bg-brand-500 text-white shadow",
                      !selected && available && "hover:scale-110",
                      !available && "cursor-not-allowed",
                    )}
                    style={
                      selected
                        ? { width: SIZE, height: SIZE }
                        : available
                          ? { width: SIZE, height: SIZE, background: tint(zone.color), borderColor: zone.color ?? "#9ca3af", color: zone.color ?? "#374151" }
                          : { width: SIZE, height: SIZE, background: seat.status === "HELD" ? "#fde68a" : "#d1d5db", borderColor: "transparent", color: "#9ca3af" }
                    }
                  >
                    {seat.number}
                  </button>
                );
              })}
              <span className="w-6 shrink-0 text-center text-[11px] font-bold text-ink-400">{rowLabels.get(r) ?? ""}</span>
            </div>
          ))}
        </div>
      </div>

      {standingZones.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-ink-800">Khu đứng — chọn số lượng</p>
          {standingZones.map((z) => (
            <StandingZoneRow key={z.id} zone={z} standing={standing} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-4 border-t border-ink-100 pt-4 text-xs text-ink-500">
        <Legend swatch="bg-white ring-2 ring-inset ring-ink-300" label="Còn trống (màu theo khu)" />
        <Legend swatch="bg-brand-500" label="Đang chọn" />
        <Legend swatch="bg-amber-200" label="Đang được giữ" />
        <Legend swatch="bg-ink-300" label="Đã bán / không khả dụng" />
      </div>
    </div>
  );
}

/**
 * A standing zone (no seats): bought by quantity through the ticket type
 * event-service keeps for it, with what's left of its capacity.
 */
function StandingZoneRow({ zone, standing }: { zone: SeatMapData["zones"][number]; standing: StandingSelection }) {
  const tt = zone.ticketTypeId ? standing.ticketTypes.find((t) => t.id === zone.ticketTypeId) : undefined;
  const qty = tt ? (standing.quantities[tt.id] ?? 0) : 0;
  const left = tt ? Math.max(0, tt.quantityTotal - tt.quantitySold) : 0;
  const max = tt ? Math.min(left, tt.maxPerOrder ?? 10) : 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed px-4 py-3" style={{ borderColor: zone.color ?? "#d1d5db" }}>
      <div>
        <p className="font-semibold text-ink-800">
          {zone.name} <span className="font-normal text-ink-500">· {formatVnd(zone.price)}</span>
        </p>
        <p className="text-xs text-ink-500">
          Khu đứng tự do, không có số ghế · {tt ? (left > 0 ? `còn ${left.toLocaleString("vi-VN")} vé` : "đã hết vé") : `sức chứa ${zone.capacity ?? "—"}`}
        </p>
      </div>
      {tt && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={qty <= 0}
            onClick={() => standing.onQuantityChange(tt.id, qty - 1)}
            className="h-8 w-8 rounded-lg bg-ink-100 font-bold text-ink-700 hover:bg-ink-200 disabled:opacity-40"
          >
            −
          </button>
          <span className="w-6 text-center font-bold">{qty}</span>
          <button
            type="button"
            disabled={qty >= max}
            onClick={() => standing.onQuantityChange(tt.id, qty + 1)}
            className="h-8 w-8 rounded-lg bg-brand-500 font-bold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
