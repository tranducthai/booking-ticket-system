import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";

interface ZoneDraft {
  name: string;
  price: string;
  isGeneral: boolean;
  capacity: string;
  rows: string;
  seatsPerRow: string;
}

const EMPTY_ZONE: ZoneDraft = { name: "", price: "", isGeneral: false, capacity: "", rows: "", seatsPerRow: "" };

export function SeatMapBuilder({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const { data: seatMap } = useQuery({
    queryKey: ["seat-map", eventId],
    queryFn: () => eventsApi.seatMap.get(eventId),
    retry: false,
  });

  const [zones, setZones] = useState<ZoneDraft[]>([{ ...EMPTY_ZONE }]);
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () =>
      eventsApi.seatMap.createOrReplace(eventId, {
        zones: zones.map((z) => ({
          name: z.name,
          price: Number(z.price),
          isGeneral: z.isGeneral,
          capacity: z.isGeneral ? Number(z.capacity) : undefined,
          rows: z.isGeneral ? undefined : Number(z.rows),
          seatsPerRow: z.isGeneral ? undefined : Number(z.seatsPerRow),
        })),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seat-map", eventId] }),
    onError: (err) => setError(apiErrorMessage(err, "Không thể lưu sơ đồ ghế.")),
  });

  function updateZone(i: number, patch: Partial<ZoneDraft>) {
    setZones((zs) => zs.map((z, idx) => (idx === i ? { ...z, ...patch } : z)));
  }

  return (
    <div className="card p-6">
      <h3 className="text-base font-bold text-ink-800">Sơ đồ chỗ ngồi</h3>

      {seatMap && (
        <div className="mt-3 space-y-1.5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Đã có sơ đồ với {seatMap.zones.length} khu vực · {seatMap.zones.reduce((n, z) => n + z.seats.length, 0)} ghế.
          Lưu lại bên dưới sẽ <strong>thay thế toàn bộ</strong> sơ đồ hiện tại.
        </div>
      )}

      <div className="mt-4 space-y-4">
        {zones.map((zone, i) => (
          <div key={i} className="rounded-xl border border-ink-100 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink-700">Khu vực {i + 1}</p>
              {zones.length > 1 && (
                <button onClick={() => setZones((zs) => zs.filter((_, idx) => idx !== i))} className="text-xs font-semibold text-red-500">
                  Xóa
                </button>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input placeholder="Tên khu vực (VD: VIP)" value={zone.name} onChange={(e) => updateZone(i, { name: e.target.value })} className="input" />
              <input
                type="number"
                placeholder="Giá vé (VND)"
                value={zone.price}
                onChange={(e) => updateZone(i, { price: e.target.value })}
                className="input"
              />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-ink-600">
              <input type="checkbox" checked={zone.isGeneral} onChange={(e) => updateZone(i, { isGeneral: e.target.checked })} />
              Khu vực đứng tự do (không chia ghế)
            </label>
            {zone.isGeneral ? (
              <input
                type="number"
                placeholder="Sức chứa"
                value={zone.capacity}
                onChange={(e) => updateZone(i, { capacity: e.target.value })}
                className="input mt-3"
              />
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="Số hàng"
                  value={zone.rows}
                  onChange={(e) => updateZone(i, { rows: e.target.value })}
                  className="input"
                />
                <input
                  type="number"
                  placeholder="Ghế mỗi hàng"
                  value={zone.seatsPerRow}
                  onChange={(e) => updateZone(i, { seatsPerRow: e.target.value })}
                  className="input"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <button onClick={() => setZones((zs) => [...zs, { ...EMPTY_ZONE }])} className="btn-ghost mt-3 text-sm">
        + Thêm khu vực
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="btn-primary mt-4">
        {saveMutation.isPending ? "Đang lưu..." : "Lưu sơ đồ ghế"}
      </button>
    </div>
  );
}
