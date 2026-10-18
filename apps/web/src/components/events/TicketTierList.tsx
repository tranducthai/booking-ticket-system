import clsx from "clsx";
import { useState } from "react";
import type { TicketType } from "../../api/types";
import { formatVnd } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { RichText } from "../ui/RichText";

/** Hard ceiling per tier per order on top of the tier's / event's own limits (keeps one hold reasonable). */
const UI_MAX_PER_TIER = 8;

/**
 * Ticketbox-style tier list: one collapsible row per tier — name, price on
 * the right, sold-out badge or quantity picker; expanding it shows what the
 * tier includes. The first tier that has a description starts open.
 */
export function TicketTierList({
  tiers,
  quantities,
  onChange,
  maxTicketsPerAccount,
}: {
  tiers: TicketType[];
  quantities: Record<string, number>;
  onChange: (tierId: string, quantity: number) => void;
  maxTicketsPerAccount: number | null;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(tiers.find((t) => t.description)?.id ? [tiers.find((t) => t.description)!.id] : []));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (tiers.length === 0) return <p className="text-sm text-ink-500">Ban tổ chức chưa thiết lập loại vé cho sự kiện này.</p>;

  return (
    <div className="space-y-2.5">
      {tiers.map((tt) => {
        const remaining = Math.max(0, tt.quantityTotal - tt.quantitySold);
        const cap = Math.min(remaining, UI_MAX_PER_TIER, tt.maxPerOrder ?? UI_MAX_PER_TIER, maxTicketsPerAccount ?? UI_MAX_PER_TIER);
        // Not enough left to meet the tier's per-order minimum is as good as sold out.
        const soldOut = remaining === 0 || cap < tt.minPerOrder;
        const expandable = !!tt.description;
        const isOpen = open.has(tt.id);
        const limits = [tt.minPerOrder > 1 ? `tối thiểu ${tt.minPerOrder}` : null, tt.maxPerOrder != null ? `tối đa ${tt.maxPerOrder}` : null].filter(Boolean);

        return (
          <div key={tt.id} className={clsx("rounded-xl border", soldOut ? "border-ink-100 bg-ink-50/70" : "border-ink-200 bg-white")}>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <button
                type="button"
                onClick={() => expandable && toggle(tt.id)}
                className={clsx("flex min-w-0 flex-1 items-center gap-2 text-left", expandable ? "cursor-pointer" : "cursor-default")}
                aria-expanded={expandable ? isOpen : undefined}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={clsx("h-4 w-4 shrink-0 text-ink-400 transition-transform", isOpen && "rotate-90", !expandable && "invisible")}
                  fill="none"
                >
                  <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="min-w-0">
                  <span className={clsx("block truncate font-bold uppercase tracking-wide", soldOut ? "text-ink-400" : "text-ink-900")}>{tt.name}</span>
                  {!soldOut && (
                    <span className="block text-xs text-ink-400">
                      Còn {remaining} vé{limits.length > 0 ? ` · Mỗi đơn ${limits.join(", ")}` : ""}
                      {tt.deliveryMethod === "PRINT_AT_HOME" ? " · Vé tự in" : ""}
                    </span>
                  )}
                </span>
              </button>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={clsx("text-base font-extrabold", soldOut ? "text-ink-400" : "text-emerald-600")}>{formatVnd(tt.price)}</span>
                {soldOut && <Badge tone="danger">Hết vé</Badge>}
              </div>

              {!soldOut && (
                <QuantityStepper value={quantities[tt.id] ?? 0} min={tt.minPerOrder} max={cap} onChange={(v) => onChange(tt.id, v)} />
              )}
            </div>

            {expandable && isOpen && (
              <div className="border-t border-ink-100 px-4 py-3 pl-10">
                <RichText text={tt.description!} className="text-ink-600" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 0, or min..max — a tier with a per-order minimum jumps straight from 0 to min and back. */
function QuantityStepper({ value, min = 1, max, onChange }: { value: number; min?: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(value <= min ? 0 : value - 1)}
        disabled={value === 0}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 font-bold text-ink-600 disabled:opacity-40"
      >
        −
      </button>
      <span className="w-5 text-center font-bold">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value === 0 ? min : value + 1))}
        disabled={value >= max}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 font-bold text-brand-600 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

/** The venue's ticket-zone map ("sơ đồ hạng mục vé") — click to view full size. */
export function ZoneMap({ url, alt }: { url: string; alt: string }) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setZoomed(true)} className="group block w-full overflow-hidden rounded-xl border border-ink-100 bg-ink-50">
        <img src={url} alt={alt} className="mx-auto max-h-[28rem] w-auto object-contain transition-transform group-hover:scale-[1.01]" />
        <span className="block py-1.5 text-center text-xs text-ink-400">Bấm để phóng to</span>
      </button>
      {zoomed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoomed(false)}>
          <img src={url} alt={alt} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </>
  );
}
