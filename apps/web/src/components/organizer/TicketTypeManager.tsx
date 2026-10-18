import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import type { EventItem, TicketDeliveryMethod, TicketType } from "../../api/types";
import { Badge } from "../ui/Badge";
import { formatDateTime, formatVnd } from "../../lib/format";

const DELIVERY_METHOD_LABEL: Record<TicketDeliveryMethod, string> = {
  E_TICKET: "Vé điện tử",
  PRINT_AT_HOME: "Vé tự in",
};

type TierForm = {
  name: string;
  price: string;
  quantityTotal: string;
  deliveryMethod: TicketDeliveryMethod;
  description: string;
  minPerOrder: string;
  maxPerOrder: string;
  isHidden: boolean;
};

const EMPTY_FORM: TierForm = {
  name: "",
  price: "",
  quantityTotal: "",
  deliveryMethod: "E_TICKET",
  description: "",
  minPerOrder: "1",
  maxPerOrder: "",
  isHidden: false,
};

function toForm(tt: TicketType): TierForm {
  return {
    name: tt.name,
    price: String(Number(tt.price)),
    quantityTotal: String(tt.quantityTotal),
    deliveryMethod: tt.deliveryMethod,
    description: tt.description ?? "",
    minPerOrder: String(tt.minPerOrder),
    maxPerOrder: tt.maxPerOrder != null ? String(tt.maxPerOrder) : "",
    isHidden: tt.isHidden,
  };
}

function toPayload(form: TierForm) {
  return {
    name: form.name,
    price: Number(form.price),
    quantityTotal: Number(form.quantityTotal),
    deliveryMethod: form.deliveryMethod,
    description: form.description,
    minPerOrder: Number(form.minPerOrder) || 1,
    maxPerOrder: form.maxPerOrder ? Number(form.maxPerOrder) : null,
    isHidden: form.isHidden,
  };
}

export function TicketTypeManager({ event }: { event: EventItem & { ticketTypes?: TicketType[] } }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<TierForm>(EMPTY_FORM);
  const showtimes = event.showtimes ?? [];
  // With a schedule, every tier belongs to one showtime — new tiers go to the one picked here.
  const [showtimeId, setShowtimeId] = useState("");
  const groups =
    showtimes.length > 0
      ? showtimes.map((s) => ({ key: s.id, title: formatDateTime(s.startTime), tiers: (event.ticketTypes ?? []).filter((t) => t.showtimeId === s.id) }))
      : [{ key: "all", title: "", tiers: event.ticketTypes ?? [] }];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => eventsApi.ticketTypes.create(event.id, { ...toPayload(form), ...(showtimes.length > 0 ? { showtimeId } : {}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", event.id] });
      setForm(EMPTY_FORM);
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể tạo loại vé.")),
  });

  return (
    <div className="card p-6">
      <h3 className="text-base font-bold text-ink-800">Loại vé</h3>

      <div className="mt-4 space-y-4">
        {groups.map((g) => (
          <div key={g.key} className="space-y-2">
            {g.title && <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Suất {g.title}</p>}
            {g.tiers.length === 0 && g.title && <p className="text-sm text-ink-400">Chưa có hạng vé cho suất này.</p>}
        {g.tiers.map((tt) =>
          editingId === tt.id ? (
            <TierEditRow key={tt.id} eventId={event.id} tier={tt} onDone={() => setEditingId(null)} />
          ) : (
            <div key={tt.id} className="rounded-xl border border-ink-100 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2 font-semibold text-ink-800">
                  {tt.name}
                  <Badge tone={tt.deliveryMethod === "E_TICKET" ? "brand" : "neutral"}>{DELIVERY_METHOD_LABEL[tt.deliveryMethod]}</Badge>
                  {tt.isHidden && <Badge tone="warning">Đang ẩn</Badge>}
                  {tt.quantitySold >= tt.quantityTotal && <Badge tone="danger">Hết vé</Badge>}
                </span>
                <span className="flex items-center gap-3 text-ink-500">
                  {formatVnd(tt.price)} · Đã bán {tt.quantitySold}/{tt.quantityTotal}
                  <button onClick={() => setEditingId(tt.id)} className="btn-ghost px-2 py-1 text-xs">
                    Sửa
                  </button>
                </span>
              </div>
              {(tt.minPerOrder > 1 || tt.maxPerOrder != null) && (
                <p className="mt-1 text-xs text-ink-400">
                  Mỗi đơn: tối thiểu {tt.minPerOrder}
                  {tt.maxPerOrder != null ? `, tối đa ${tt.maxPerOrder}` : ""} vé
                </p>
              )}
              {tt.description && <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-ink-500">{tt.description}</p>}
            </div>
          ),
        )}
          </div>
        ))}
        {(!event.ticketTypes || event.ticketTypes.length === 0) && showtimes.length === 0 && (
          <p className="text-sm text-ink-400">Chưa có loại vé nào — thêm ít nhất một loại bên dưới.</p>
        )}
      </div>

      <div className="mt-5 border-t border-ink-100 pt-5">
        <p className="label">Thêm loại vé</p>
        {showtimes.length > 0 && (
          <select value={showtimeId} onChange={(e) => setShowtimeId(e.target.value)} className="input mb-3">
            <option value="">— Chọn suất diễn cho hạng vé này —</option>
            {showtimes.map((s) => (
              <option key={s.id} value={s.id}>
                {formatDateTime(s.startTime)}
              </option>
            ))}
          </select>
        )}
        <TierFields form={form} onChange={setForm} />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          onClick={() => {
            setError(null);
            createMutation.mutate();
          }}
          disabled={!form.name || !form.price || !form.quantityTotal || (showtimes.length > 0 && !showtimeId) || createMutation.isPending}
          className="btn-secondary mt-3"
        >
          + Thêm loại vé
        </button>
      </div>
    </div>
  );
}

function TierEditRow({ eventId, tier, onDone }: { eventId: string; tier: TicketType; onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<TierForm>(toForm(tier));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => eventsApi.ticketTypes.update(tier.id, toPayload(form)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", eventId] });
      onDone();
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể lưu loại vé.")),
  });

  return (
    <div className="rounded-xl border-2 border-brand-200 bg-brand-50/30 p-4">
      <TierFields form={form} onChange={setForm} />
      {tier.quantitySold > 0 && (
        <p className="mt-2 text-xs text-ink-400">Đã bán {tier.quantitySold} vé — không thể giảm số lượng xuống dưới mức này.</p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!form.name || !form.price || !form.quantityTotal || mutation.isPending}
          className="btn-primary"
        >
          {mutation.isPending ? "Đang lưu..." : "Lưu"}
        </button>
        <button onClick={onDone} className="btn-ghost">
          Hủy
        </button>
      </div>
    </div>
  );
}

function TierFields({ form, onChange }: { form: TierForm; onChange: (f: TierForm) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <input placeholder="Tên loại vé" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} className="input sm:col-span-2" />
      <input
        type="number"
        placeholder="Giá (VND)"
        value={form.price}
        onChange={(e) => onChange({ ...form, price: e.target.value })}
        className="input"
      />
      <input
        type="number"
        placeholder="Số lượng"
        value={form.quantityTotal}
        onChange={(e) => onChange({ ...form, quantityTotal: e.target.value })}
        className="input"
      />
      <textarea
        placeholder={"Quyền lợi / mô tả (không bắt buộc)\n- Khu vực đứng gần sân khấu\n- Tặng kèm lightstick"}
        value={form.description}
        onChange={(e) => onChange({ ...form, description: e.target.value })}
        className="input min-h-[72px] sm:col-span-4"
      />
      <div>
        <label className="text-xs text-ink-500">Tối thiểu / đơn</label>
        <input
          type="number"
          min={1}
          value={form.minPerOrder}
          onChange={(e) => onChange({ ...form, minPerOrder: e.target.value })}
          className="input"
        />
      </div>
      <div>
        <label className="text-xs text-ink-500">Tối đa / đơn</label>
        <input
          type="number"
          min={1}
          placeholder="Không giới hạn"
          value={form.maxPerOrder}
          onChange={(e) => onChange({ ...form, maxPerOrder: e.target.value })}
          className="input"
        />
      </div>
      <div>
        <label className="text-xs text-ink-500">Hình thức</label>
        <select
          value={form.deliveryMethod}
          onChange={(e) => onChange({ ...form, deliveryMethod: e.target.value as TicketDeliveryMethod })}
          className="input"
        >
          {(Object.entries(DELIVERY_METHOD_LABEL) as [TicketDeliveryMethod, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-end gap-2 pb-2.5 text-sm text-ink-600">
        <input type="checkbox" checked={form.isHidden} onChange={(e) => onChange({ ...form, isHidden: e.target.checked })} />
        Ẩn (chưa mở bán)
      </label>
    </div>
  );
}
