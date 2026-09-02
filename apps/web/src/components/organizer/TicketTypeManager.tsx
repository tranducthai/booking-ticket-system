import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import type { EventItem, TicketType } from "../../api/types";
import { formatVnd } from "../../lib/format";

export function TicketTypeManager({ event }: { event: EventItem & { ticketTypes?: TicketType[] } }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", price: "", quantityTotal: "" });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      eventsApi.ticketTypes.create(event.id, {
        name: form.name,
        price: Number(form.price),
        quantityTotal: Number(form.quantityTotal),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", event.id] });
      setForm({ name: "", price: "", quantityTotal: "" });
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể tạo loại vé.")),
  });

  return (
    <div className="card p-6">
      <h3 className="text-base font-bold text-ink-800">Loại vé</h3>

      <div className="mt-4 space-y-2">
        {event.ticketTypes?.map((tt) => (
          <div key={tt.id} className="flex items-center justify-between rounded-xl border border-ink-100 px-4 py-3 text-sm">
            <span className="font-semibold text-ink-800">{tt.name}</span>
            <span className="text-ink-500">
              {formatVnd(tt.price)} · Đã bán {tt.quantitySold}/{tt.quantityTotal}
            </span>
          </div>
        ))}
        {(!event.ticketTypes || event.ticketTypes.length === 0) && (
          <p className="text-sm text-ink-400">Chưa có loại vé nào — thêm ít nhất một loại bên dưới.</p>
        )}
      </div>

      <div className="mt-5 grid gap-3 border-t border-ink-100 pt-5 sm:grid-cols-4">
        <input
          placeholder="Tên loại vé"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="input sm:col-span-2"
        />
        <input
          type="number"
          placeholder="Giá (VND)"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          className="input"
        />
        <input
          type="number"
          placeholder="Số lượng"
          value={form.quantityTotal}
          onChange={(e) => setForm({ ...form, quantityTotal: e.target.value })}
          className="input"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        onClick={() => {
          setError(null);
          createMutation.mutate();
        }}
        disabled={!form.name || !form.price || !form.quantityTotal || createMutation.isPending}
        className="btn-secondary mt-3"
      >
        + Thêm loại vé
      </button>
    </div>
  );
}
