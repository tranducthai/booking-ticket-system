import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rules } from "../../lib/validation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import type { SeatMapLayout } from "../../api/types";
import { formatVnd } from "../../lib/format";
import { cellKey, previewLabels, tint, ZONE_COLORS } from "../../lib/seatCanvas";

interface ZoneDraft {
  key: string;
  name: string;
  price: string;
  color: string;
  isGeneral: boolean;
  capacity: string;
}

interface Draft {
  rows: number;
  cols: number;
  stageLabel: string;
  zones: ZoneDraft[];
  /** "r:c" -> zone key */
  cells: Map<string, string>;
}

const ERASE = "__erase__";
let keySeq = 0;
const newKey = () => `z${++keySeq}`;

function defaultDraft(): Draft {
  const key = newKey();
  const rows = 10;
  const cols = 18;
  const cells = new Map<string, string>();
  // A plain block with a centre aisle as a starting point — repaint freely.
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (c !== Math.floor(cols / 2)) cells.set(cellKey(r, c), key);
  return { rows, cols, stageLabel: "SÂN KHẤU", zones: [{ key, name: "Khu A", price: "", color: ZONE_COLORS[0], isGeneral: false, capacity: "" }], cells };
}

/** Existing map -> editable draft. Old-style maps (no canvas) are laid out as stacked, centred blocks. */
function draftFromLayout(layout: SeatMapLayout): Draft {
  const zones: ZoneDraft[] = layout.zones.map((z, i) => ({
    key: z.id,
    name: z.name,
    price: String(Number(z.price)),
    color: z.color ?? ZONE_COLORS[i % ZONE_COLORS.length],
    isGeneral: z.isGeneral,
    capacity: z.capacity ? String(z.capacity) : "",
  }));
  const cells = new Map<string, string>();
  if (layout.canvas) {
    for (const z of layout.zones) for (const s of z.seats) if (s.gridRow != null && s.gridCol != null) cells.set(cellKey(s.gridRow, s.gridCol), z.id);
    return { rows: layout.canvas.rows, cols: layout.canvas.cols, stageLabel: layout.canvas.stageLabel, zones, cells };
  }
  const seated = layout.zones.filter((z) => !z.isGeneral && z.seats.length > 0);
  const rowsOf = (z: (typeof seated)[number]) => {
    const byRow = new Map<string, number>();
    for (const s of z.seats) byRow.set(s.row, (byRow.get(s.row) ?? 0) + 1);
    return [...byRow.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, n]) => n);
  };
  const cols = Math.min(80, Math.max(4, ...seated.flatMap(rowsOf)));
  let r = 0;
  for (const z of seated) {
    for (const n of rowsOf(z)) {
      const start = Math.floor((cols - Math.min(n, cols)) / 2);
      for (let c = 0; c < Math.min(n, cols); c++) cells.set(cellKey(r, start + c), z.id);
      r++;
    }
    r++; // walkway between zones
  }
  return { rows: Math.min(60, Math.max(1, r - 1)), cols, stageLabel: "SÂN KHẤU", zones, cells };
}

/**
 * Hall designer for SEATMAP events (cinema-style seat picking): size the
 * grid, define price zones (name, price, color), then paint seats onto cells
 * with the selected zone — click or drag; the eraser turns cells into aisles.
 * Standing zones (no seats) are kept as capacity-only. Saving replaces the
 * whole map (event-service refuses once any seat is held or sold).
 */
export function SeatMapDesigner({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const { data: layout, isLoading, isError } = useQuery({
    queryKey: ["seat-map-layout", eventId],
    queryFn: () => eventsApi.seatMap.getLayout(eventId),
    retry: false,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [brush, setBrush] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const painting = useRef(false);

  useEffect(() => {
    if (draft || isLoading) return;
    const d = layout ? draftFromLayout(layout) : isError ? defaultDraft() : null;
    if (d) {
      setDraft(d);
      setBrush(d.zones.find((z) => !z.isGeneral)?.key ?? ERASE);
    }
  }, [draft, layout, isLoading, isError]);

  useEffect(() => {
    const stop = () => (painting.current = false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const labels = useMemo(() => previewLabels(draft?.cells.keys() ?? []), [draft?.cells]);

  const save = useMutation({
    mutationFn: () => {
      const d = draft!;
      if (d.zones.length === 0) throw new Error("Cần ít nhất một khu.");
      if (new Set(d.zones.map((z) => z.name.trim().toLowerCase())).size !== d.zones.length) throw new Error("Tên các khu không được trùng nhau.");
      for (const z of d.zones) {
        const err =
          rules.length(z.name, "Tên khu", 1, 60) ??
          rules.money(z.price, `giá vé khu "${z.name || "?"}"`) ??
          (z.isGeneral ? rules.int(z.capacity, `Sức chứa khu "${z.name}"`, 1, 100_000) : null);
        if (err) throw new Error(err);
      }
      const cellsOf = (key: string) =>
        [...d.cells.entries()].filter(([, k]) => k === key).map(([ck]) => {
          const [r, c] = ck.split(":").map(Number);
          return { r, c };
        });
      const empty = d.zones.find((z) => !z.isGeneral && cellsOf(z.key).length === 0);
      if (empty) throw new Error(`Khu "${empty.name}" chưa có ghế nào — tô ghế cho khu này hoặc xoá khu.`);
      return eventsApi.seatMap.createOrReplace(eventId, {
        canvas: { rows: d.rows, cols: d.cols, stageLabel: d.stageLabel },
        zones: d.zones.map((z) => ({
          name: z.name.trim(),
          price: Number(z.price),
          color: z.color,
          isGeneral: z.isGeneral,
          ...(z.isGeneral ? { capacity: Number(z.capacity) } : { cells: cellsOf(z.key) }),
        })),
      });
    },
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["seat-map-layout", eventId] });
    },
    onError: (err) => setError(err instanceof Error && !("isAxiosError" in err) ? err.message : apiErrorMessage(err, "Không thể lưu sơ đồ.")),
  });

  if (!draft) return <div className="card p-6 text-sm text-ink-400">Đang tải sơ đồ…</div>;

  const update = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const zoneByKey = new Map(draft.zones.map((z) => [z.key, z]));

  const paint = (r: number, c: number) => {
    setSaved(false);
    setDraft((d) => {
      if (!d) return d;
      const cells = new Map(d.cells);
      if (brush === ERASE || !zoneByKey.get(brush) || zoneByKey.get(brush)!.isGeneral) cells.delete(cellKey(r, c));
      else cells.set(cellKey(r, c), brush);
      return { ...d, cells };
    });
  };
  const paintRow = (r: number) => {
    for (let c = 0; c < draft.cols; c++) paint(r, c);
  };
  const resize = (rows: number, cols: number) => {
    const cells = new Map([...draft.cells].filter(([k]) => {
      const [r, c] = k.split(":").map(Number);
      return r < rows && c < cols;
    }));
    update({ rows, cols, cells });
  };
  const setZone = (key: string, patch: Partial<ZoneDraft>) => update({ zones: draft.zones.map((z) => (z.key === key ? { ...z, ...patch } : z)) });
  const removeZone = (key: string) => {
    const cells = new Map([...draft.cells].filter(([, k]) => k !== key));
    update({ zones: draft.zones.filter((z) => z.key !== key), cells });
    if (brush === key) setBrush(ERASE);
  };
  const addZone = (isGeneral: boolean) => {
    const key = newKey();
    const color = ZONE_COLORS[draft.zones.length % ZONE_COLORS.length];
    update({ zones: [...draft.zones, { key, name: isGeneral ? "Khu đứng" : `Khu ${String.fromCharCode(65 + draft.zones.length)}`, price: "", color, isGeneral, capacity: "" }] });
    if (!isGeneral) setBrush(key);
  };
  const countOf = (key: string) => [...draft.cells.values()].filter((k) => k === key).length;
  const CELL = 22;

  return (
    <div className="card p-6">
      <h3 className="text-base font-bold text-ink-800">Sơ đồ sân khấu & chỗ ngồi</h3>
      <p className="mt-1 text-sm text-ink-500">
        Tạo các khu (tên, giá, màu), chọn một khu rồi <strong>bấm hoặc kéo</strong> trên lưới để tô ghế. Dùng <strong>Lối đi</strong> để xoá ô. Bấm nhãn hàng để tô cả hàng.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="label">Số hàng</span>
          <input type="number" min={1} max={60} value={draft.rows} onChange={(e) => resize(Math.min(60, Math.max(1, Number(e.target.value) || 1)), draft.cols)} className="input" />
        </label>
        <label className="text-sm">
          <span className="label">Số cột</span>
          <input type="number" min={1} max={80} value={draft.cols} onChange={(e) => resize(draft.rows, Math.min(80, Math.max(1, Number(e.target.value) || 1)))} className="input" />
        </label>
        <label className="text-sm">
          <span className="label">Nhãn sân khấu</span>
          <input value={draft.stageLabel} maxLength={40} onChange={(e) => update({ stageLabel: e.target.value })} className="input" />
        </label>
      </div>

      <div className="mt-5 space-y-2">
        <p className="label">Khu vực & giá vé</p>
        {draft.zones.map((z) => (
          <div key={z.key} className={`flex flex-wrap items-center gap-2 rounded-xl border p-2 ${brush === z.key ? "border-brand-400 bg-brand-50/40" : "border-ink-100"}`}>
            <input type="color" value={z.color} onChange={(e) => setZone(z.key, { color: e.target.value })} className="h-8 w-9 cursor-pointer rounded border-0 p-0" title="Màu khu" />
            <input value={z.name} onChange={(e) => setZone(z.key, { name: e.target.value })} placeholder="Tên khu (VD: VIP)" className="input w-40 py-1.5" />
            <input type="number" min={0} value={z.price} onChange={(e) => setZone(z.key, { price: e.target.value })} placeholder="Giá (VND)" className="input w-32 py-1.5" />
            {z.isGeneral ? (
              <input type="number" min={1} value={z.capacity} onChange={(e) => setZone(z.key, { capacity: e.target.value })} placeholder="Sức chứa" className="input w-28 py-1.5" />
            ) : (
              <button type="button" onClick={() => setBrush(z.key)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${brush === z.key ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}>
                {brush === z.key ? "Đang tô" : "Tô ghế"} · {countOf(z.key)} ghế
              </button>
            )}
            {z.isGeneral && <span className="text-xs text-ink-400">Khu đứng (không chia ghế)</span>}
            {z.price !== "" && <span className="text-xs text-ink-400">{formatVnd(Number(z.price))}</span>}
            <button type="button" onClick={() => removeZone(z.key)} className="ml-auto text-xs font-semibold text-red-500 hover:underline">
              Xoá
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-3 text-sm">
          <button type="button" onClick={() => addZone(false)} className="font-semibold text-brand-600 hover:underline">
            + Thêm khu có ghế
          </button>
          <button type="button" onClick={() => addZone(true)} className="font-semibold text-brand-600 hover:underline">
            + Thêm khu đứng
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-ink-600">Công cụ:</span>
        <button type="button" onClick={() => setBrush(ERASE)} className={`rounded-lg px-3 py-1.5 font-semibold ${brush === ERASE ? "bg-ink-800 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}>
          Lối đi (xoá ô)
        </button>
        <button
          type="button"
          disabled={brush === ERASE}
          onClick={() => {
            const cells = new Map(draft.cells);
            for (let r = 0; r < draft.rows; r++) for (let c = 0; c < draft.cols; c++) if (!cells.has(cellKey(r, c))) cells.set(cellKey(r, c), brush);
            update({ cells });
          }}
          className="rounded-lg bg-ink-100 px-3 py-1.5 font-semibold text-ink-600 hover:bg-ink-200 disabled:opacity-40"
        >
          Tô kín ô trống
        </button>
        <button type="button" onClick={() => update({ cells: new Map() })} className="rounded-lg bg-ink-100 px-3 py-1.5 font-semibold text-ink-600 hover:bg-ink-200">
          Xoá hết ghế
        </button>
        <span className="ml-auto text-ink-500">Tổng: {draft.cells.size} ghế</span>
      </div>

      <div className="mt-3 overflow-auto rounded-xl bg-ink-50 p-4" style={{ maxHeight: 560 }}>
        <div className="mx-auto w-max select-none" onPointerLeave={() => (painting.current = false)}>
          <div className="mx-auto mb-4 rounded-b-[40px] rounded-t-md bg-ink-800 py-2 text-center text-xs font-bold tracking-[0.3em] text-white" style={{ width: Math.max(120, draft.cols * (CELL + 2) * 0.7) }}>
            {draft.stageLabel || "SÂN KHẤU"}
          </div>
          {Array.from({ length: draft.rows }, (_, r) => (
            <div key={r} className="flex items-center gap-[2px] py-[1px]">
              <button type="button" onClick={() => paintRow(r)} title="Tô / xoá cả hàng" className="w-6 shrink-0 text-center text-[10px] font-bold text-ink-400 hover:text-brand-600">
                {r + 1}
              </button>
              {Array.from({ length: draft.cols }, (_, c) => {
                const key = draft.cells.get(cellKey(r, c));
                const zone = key ? zoneByKey.get(key) : undefined;
                return (
                  <div
                    key={c}
                    title={zone ? `${labels.get(cellKey(r, c))} · ${zone.name}` : "Lối đi"}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      painting.current = true;
                      paint(r, c);
                    }}
                    onPointerEnter={() => painting.current && paint(r, c)}
                    className="cursor-crosshair rounded-[4px] border"
                    style={{
                      width: CELL,
                      height: CELL,
                      background: zone ? tint(zone.color, "aa") : "transparent",
                      borderColor: zone ? zone.color : "#e5e7eb",
                      borderStyle: zone ? "solid" : "dashed",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {layout && (
        <p className="mt-3 text-xs text-amber-700">Lưu sẽ thay thế toàn bộ sơ đồ hiện tại. Không thể thay khi đã có ghế được giữ hoặc đã bán.</p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
          {save.isPending ? "Đang lưu..." : "Lưu sơ đồ"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Đã lưu ✓</span>}
      </div>
    </div>
  );
}
