import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import type { TicketMode } from "../../api/types";

export function OrganizerEventFormPage() {
  const navigate = useNavigate();
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: eventsApi.categories });

  const [form, setForm] = useState({
    title: "",
    categoryId: "",
    venueName: "",
    venueAddress: "",
    startTime: "",
    endTime: "",
    ticketMode: "GENERAL" as TicketMode,
    description: "",
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      eventsApi.create({
        ...form,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
      }),
    onSuccess: (event) => navigate(`/kenh-to-chuc/su-kien/${event.id}`),
    onError: (err) => setError(apiErrorMessage(err, "Không thể tạo sự kiện.")),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <div className="card max-w-2xl p-6 sm:p-8">
      <h2 className="text-lg font-bold text-ink-800">Tạo sự kiện mới</h2>
      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div>
          <label className="label">Tên sự kiện</label>
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
        </div>

        <div>
          <label className="label">Danh mục</label>
          <select
            required
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="input"
          >
            <option value="">— Chọn danh mục —</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Địa điểm</label>
            <input required value={form.venueName} onChange={(e) => setForm({ ...form, venueName: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Địa chỉ</label>
            <input required value={form.venueAddress} onChange={(e) => setForm({ ...form, venueAddress: e.target.value })} className="input" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Bắt đầu</label>
            <input
              required
              type="datetime-local"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label">Kết thúc</label>
            <input
              required
              type="datetime-local"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="label">Mô hình bán vé</label>
          <div className="grid grid-cols-2 gap-3">
            {(["GENERAL", "SEATMAP"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                onClick={() => setForm({ ...form, ticketMode: mode })}
                className={`rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold transition-colors ${
                  form.ticketMode === mode ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-100 text-ink-600"
                }`}
              >
                {mode === "GENERAL" ? "Vé tự do (General Admission)" : "Sơ đồ chỗ ngồi (Seat Map)"}
                <p className="mt-0.5 text-xs font-normal text-ink-400">
                  {mode === "GENERAL" ? "Bán theo hạng vé & số lượng" : "Khách chọn ghế cụ thể"}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Mô tả</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="input min-h-[120px]"
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={mutation.isPending} className="btn-primary w-full py-3 text-base">
          {mutation.isPending ? "Đang tạo..." : "Tạo sự kiện (bản nháp)"}
        </button>
      </form>
    </div>
  );
}
