import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import type { DiscountCode } from "../../api/types";

export function DiscountCodeManager({ eventId }: { eventId: string }) {
  const [form, setForm] = useState({ code: "", discountType: "PERCENT" as "PERCENT" | "FIXED", value: "", quantityTotal: "" });
  const [created, setCreated] = useState<DiscountCode[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      eventsApi.discountCodes.create(eventId, {
        code: form.code.toUpperCase(),
        discountType: form.discountType,
        value: Number(form.value),
        quantityTotal: Number(form.quantityTotal),
      }),
    onSuccess: (dc) => {
      setCreated((c) => [dc, ...c]);
      setForm({ code: "", discountType: "PERCENT", value: "", quantityTotal: "" });
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể tạo mã giảm giá.")),
  });

  return (
    <div className="card p-6">
      <h3 className="text-base font-bold text-ink-800">Mã giảm giá</h3>

      {created.length > 0 && (
        <div className="mt-3 space-y-2">
          {created.map((dc) => (
            <div key={dc.id} className="flex items-center justify-between rounded-xl border border-ink-100 px-4 py-2.5 text-sm">
              <span className="font-mono font-bold text-brand-600">{dc.code}</span>
              <span className="text-ink-500">
                {dc.discountType === "PERCENT" ? `${dc.value}%` : `${dc.value} VND`} · số lượng {dc.quantityTotal}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <input
          placeholder="Mã (VD: SUMMER10)"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className="input"
        />
        <select
          value={form.discountType}
          onChange={(e) => setForm({ ...form, discountType: e.target.value as "PERCENT" | "FIXED" })}
          className="input"
        >
          <option value="PERCENT">Giảm %</option>
          <option value="FIXED">Giảm số tiền</option>
        </select>
        <input
          type="number"
          placeholder={form.discountType === "PERCENT" ? "% giảm" : "Số tiền"}
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
          className="input"
        />
        <input
          type="number"
          placeholder="Số lượt dùng"
          value={form.quantityTotal}
          onChange={(e) => setForm({ ...form, quantityTotal: e.target.value })}
          className="input"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        onClick={() => {
          setError(null);
          mutation.mutate();
        }}
        disabled={!form.code || !form.value || !form.quantityTotal || mutation.isPending}
        className="btn-secondary mt-3"
      >
        + Tạo mã giảm giá
      </button>
    </div>
  );
}
