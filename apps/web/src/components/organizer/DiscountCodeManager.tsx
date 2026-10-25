import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { check, rules } from "../../lib/validation";
import { useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import type { DiscountCode } from "../../api/types";
import { Badge } from "../ui/Badge";

type EditForm = { value: string; quantityTotal: string; validFrom: string; validTo: string };

/** <input type="date"> value -> the start / end of that day in the organizer's own timezone. */
const dayStart = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const dayEnd = (d: string) => new Date(`${d}T23:59:59`).toISOString();
const todayStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

/** Same rules as event-service's discount DTOs / discount-codes.service.ts. */
function discountError(f: { code?: string; type: "PERCENT" | "FIXED"; value: string; quantityTotal: string; validFrom: string; validTo: string }) {
  return [
    f.code !== undefined && !/^[A-Z0-9_-]{3,20}$/.test(f.code.trim().toUpperCase()) ? "Mã giảm giá 3–20 ký tự, chỉ gồm chữ, số, - và _" : null,
    f.type === "PERCENT" ? rules.int(f.value, "Phần trăm giảm", 1, 100) : rules.money(f.value, "Số tiền giảm", 1000, 100_000_000),
    rules.int(f.quantityTotal, "Số lượt dùng", 1, 100_000),
    f.validTo && f.validTo < todayStr() ? "Ngày hết hiệu lực không được trước hôm nay" : null,
    f.validFrom && f.validTo && f.validTo < f.validFrom ? "Ngày hết hiệu lực phải sau ngày bắt đầu" : null,
  ];
}

export function DiscountCodeManager({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: "", discountType: "PERCENT" as "PERCENT" | "FIXED", value: "", quantityTotal: "", validFrom: "", validTo: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ value: "", quantityTotal: "", validFrom: "", validTo: "" });
  const [error, setError] = useState<string | null>(null);

  const { data: codes, isLoading } = useQuery({
    queryKey: ["discount-codes", eventId],
    queryFn: () => eventsApi.discountCodes.list(eventId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["discount-codes", eventId] });

  const createMutation = useMutation({
    mutationFn: () => {
      check(...discountError({ ...form, type: form.discountType }));
      return eventsApi.discountCodes.create(eventId, {
        code: form.code.trim().toUpperCase(),
        discountType: form.discountType,
        value: Number(form.value),
        quantityTotal: Number(form.quantityTotal),
        validFrom: form.validFrom ? dayStart(form.validFrom) : undefined,
        validTo: form.validTo ? dayEnd(form.validTo) : undefined,
      });
    },
    onSuccess: () => {
      setForm({ code: "", discountType: "PERCENT", value: "", quantityTotal: "", validFrom: "", validTo: "" });
      invalidate();
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể tạo mã giảm giá.")),
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) => {
      const dc = codes?.find((c) => c.id === id);
      check(...discountError({ ...editForm, type: dc?.discountType ?? "PERCENT" }));
      return eventsApi.discountCodes.update(id, {
        value: Number(editForm.value),
        quantityTotal: Number(editForm.quantityTotal),
        validFrom: editForm.validFrom ? dayStart(editForm.validFrom) : null,
        validTo: editForm.validTo ? dayEnd(editForm.validTo) : null,
      });
    },
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể cập nhật mã giảm giá.")),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (dc: DiscountCode) => eventsApi.discountCodes.update(dc.id, { isActive: !dc.isActive }),
    onSuccess: invalidate,
    onError: (err) => setError(apiErrorMessage(err, "Không thể đổi trạng thái.")),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => eventsApi.discountCodes.remove(id),
    onSuccess: invalidate,
    onError: (err) => setError(apiErrorMessage(err, "Không thể xóa — mã đã có người dùng thì chỉ có thể vô hiệu hóa.")),
  });

  function startEdit(dc: DiscountCode) {
    setError(null);
    setEditingId(dc.id);
    setEditForm({
      value: dc.value,
      quantityTotal: String(dc.quantityTotal),
      validFrom: dc.validFrom ? dc.validFrom.slice(0, 10) : "",
      validTo: dc.validTo ? dc.validTo.slice(0, 10) : "",
    });
  }

  function isExpired(dc: DiscountCode): boolean {
    if (dc.validTo && new Date(dc.validTo) < new Date()) return true;
    return dc.quantityUsed >= dc.quantityTotal;
  }

  return (
    <div className="card p-6">
      <h3 className="text-base font-bold text-ink-800">Mã giảm giá</h3>

      {!isLoading && codes && codes.length > 0 && (
        <div className="mt-3 space-y-2">
          {codes.map((dc) =>
            editingId === dc.id ? (
              <div key={dc.id} className="rounded-xl border border-brand-200 bg-brand-50/40 p-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  <input
                    type="number"
                    value={editForm.value}
                    onChange={(e) => setEditForm({ ...editForm, value: e.target.value })}
                    placeholder={dc.discountType === "PERCENT" ? "% giảm" : "Số tiền"}
                    className="input"
                  />
                  <input
                    type="number"
                    value={editForm.quantityTotal}
                    onChange={(e) => setEditForm({ ...editForm, quantityTotal: e.target.value })}
                    placeholder="Số lượt dùng"
                    className="input"
                  />
                  <input
                    type="date"
                    value={editForm.validFrom}
                    onChange={(e) => setEditForm({ ...editForm, validFrom: e.target.value })}
                    className="input"
                  />
                  <input
                    type="date"
                    min={editForm.validFrom || todayStr()}
                    value={editForm.validTo}
                    onChange={(e) => setEditForm({ ...editForm, validTo: e.target.value })}
                    className="input"
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => updateMutation.mutate(dc.id)} disabled={updateMutation.isPending} className="btn-primary text-sm">
                    Lưu
                  </button>
                  <button onClick={() => setEditingId(null)} className="btn-ghost text-sm">
                    Hủy
                  </button>
                </div>
              </div>
            ) : (
              <div key={dc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-100 px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-brand-600">{dc.code}</span>
                  <span className="text-ink-500">
                    {dc.discountType === "PERCENT" ? `${dc.value}%` : `${Number(dc.value).toLocaleString("vi-VN")}đ`} · đã dùng{" "}
                    {dc.quantityUsed}/{dc.quantityTotal}
                  </span>
                  {(dc.validFrom || dc.validTo) && (
                    <span className="text-xs text-ink-400">
                      {dc.validFrom ? new Date(dc.validFrom).toLocaleDateString("vi-VN") : "..."} –{" "}
                      {dc.validTo ? new Date(dc.validTo).toLocaleDateString("vi-VN") : "..."}
                    </span>
                  )}
                  {!dc.isActive ? (
                    <Badge tone="neutral">Đã tắt</Badge>
                  ) : isExpired(dc) ? (
                    <Badge tone="warning">Hết hạn/hết lượt</Badge>
                  ) : (
                    <Badge tone="success">Đang hoạt động</Badge>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => startEdit(dc)} className="btn-ghost text-xs">
                    Sửa
                  </button>
                  <button onClick={() => toggleActiveMutation.mutate(dc)} className="btn-ghost text-xs">
                    {dc.isActive ? "Tắt" : "Bật"}
                  </button>
                  <button
                    onClick={() => removeMutation.mutate(dc.id)}
                    disabled={dc.quantityUsed > 0}
                    title={dc.quantityUsed > 0 ? "Mã đã có người dùng — chỉ có thể tắt, không xóa được" : undefined}
                    className="btn-ghost text-xs text-red-600 disabled:opacity-30"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <input
          placeholder="Mã (VD: SUMMER10)"
          maxLength={20}
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })}
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
          min={1}
          max={form.discountType === "PERCENT" ? 100 : undefined}
          placeholder={form.discountType === "PERCENT" ? "% giảm (1–100)" : "Số tiền (đ)"}
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
          className="input"
        />
        <input
          type="number"
          min={1}
          placeholder="Số lượt dùng"
          value={form.quantityTotal}
          onChange={(e) => setForm({ ...form, quantityTotal: e.target.value })}
          className="input"
        />
        <input
          type="date"
          title="Có hiệu lực từ (không bắt buộc)"
          value={form.validFrom}
          onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
          className="input"
        />
        <input
          type="date"
          min={form.validFrom || todayStr()}
          title="Hết hiệu lực (không bắt buộc)"
          value={form.validTo}
          onChange={(e) => setForm({ ...form, validTo: e.target.value })}
          className="input"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        onClick={() => {
          setError(null);
          createMutation.mutate();
        }}
        disabled={!form.code || !form.value || !form.quantityTotal || createMutation.isPending}
        className="btn-secondary mt-3"
      >
        + Tạo mã giảm giá
      </button>
    </div>
  );
}
