import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import type { TicketMode } from "../../api/types";
import { Badge } from "../../components/ui/Badge";
import { formatDateTime } from "../../lib/format";

export function OrganizerEventFormPage() {
  const navigate = useNavigate();
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: eventsApi.categories });

  const [form, setForm] = useState({
    title: "",
    categoryId: "",
    bannerUrl: "",
    galleryUrlsText: "",
    maxTicketsPerAccount: "",
    venueName: "",
    venueAddress: "",
    startTime: "",
    endTime: "",
    ticketMode: "GENERAL" as TicketMode,
    description: "",
  });
  const [error, setError] = useState<string | null>(null);

  const galleryUrls = form.galleryUrlsText
    .split("\n")
    .map((url) => url.trim())
    .filter(Boolean);

  const mutation = useMutation({
    mutationFn: () => {
      const { galleryUrlsText: _galleryUrlsText, maxTicketsPerAccount: maxTicketsPerAccountText, ...rest } = form;
      return eventsApi.create({
        ...rest,
        galleryUrls,
        maxTicketsPerAccount: maxTicketsPerAccountText ? Number(maxTicketsPerAccountText) : undefined,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
      });
    },
    onSuccess: (event) => navigate(`/kenh-to-chuc/su-kien/${event.id}`),
    onError: (err) => setError(apiErrorMessage(err, "Không thể tạo sự kiện.")),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  }

  const categoryName = categories?.find((c) => c.id === form.categoryId)?.name;

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
      <div className="card p-6 sm:p-8">
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

          <div>
            <label className="label">Ảnh bìa (URL)</label>
            <input
              value={form.bannerUrl}
              onChange={(e) => setForm({ ...form, bannerUrl: e.target.value })}
              className="input"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="label">Ảnh minh họa (mỗi URL một dòng)</label>
            <textarea
              value={form.galleryUrlsText}
              onChange={(e) => setForm({ ...form, galleryUrlsText: e.target.value })}
              className="input min-h-[80px]"
              placeholder={"https://...\nhttps://..."}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Địa điểm</label>
              <input required value={form.venueName} onChange={(e) => setForm({ ...form, venueName: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Địa chỉ</label>
              <input
                required
                value={form.venueAddress}
                onChange={(e) => setForm({ ...form, venueAddress: e.target.value })}
                className="input"
              />
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
            <label className="label">Giới hạn vé/tài khoản (không bắt buộc)</label>
            <input
              type="number"
              min={1}
              value={form.maxTicketsPerAccount}
              onChange={(e) => setForm({ ...form, maxTicketsPerAccount: e.target.value })}
              className="input"
              placeholder="Bỏ trống nếu không giới hạn"
            />
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

      <div className="lg:sticky lg:top-6">
        <p className="label mb-2">Xem trước</p>
        <EventPreview
          title={form.title}
          categoryName={categoryName}
          bannerUrl={form.bannerUrl}
          galleryUrls={galleryUrls}
          venueName={form.venueName}
          venueAddress={form.venueAddress}
          startTime={form.startTime}
          endTime={form.endTime}
          description={form.description}
        />
      </div>
    </div>
  );
}

function EventPreview({
  title,
  categoryName,
  bannerUrl,
  galleryUrls,
  venueName,
  venueAddress,
  startTime,
  endTime,
  description,
}: {
  title: string;
  categoryName?: string;
  bannerUrl: string;
  galleryUrls: string[];
  venueName: string;
  venueAddress: string;
  startTime: string;
  endTime: string;
  description: string;
}) {
  const hasSchedule = Boolean(startTime && endTime);

  return (
    <div className="card overflow-hidden">
      <div className="flex h-40 w-full items-center justify-center bg-gradient-to-br from-ink-800 to-ink-900 sm:h-52">
        {bannerUrl ? (
          <img src={bannerUrl} alt={title} className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
        ) : (
          <span className="px-4 text-center text-sm font-semibold text-white/70">Chưa có ảnh bìa</span>
        )}
      </div>
      <div className="p-6 sm:p-8">
        {categoryName && <Badge tone="brand">{categoryName}</Badge>}
        <h1 className="mt-3 text-2xl">{title || "Tên sự kiện của bạn"}</h1>

        <div className="mt-5 space-y-3 text-sm">
          <div className="flex items-start gap-2.5 text-ink-600">
            <CalendarIcon />
            <span>{hasSchedule ? `${formatDateTime(new Date(startTime).toISOString())} — ${formatDateTime(new Date(endTime).toISOString())}` : "Chưa chọn thời gian"}</span>
          </div>
          <div className="flex items-start gap-2.5 text-ink-600">
            <PinIcon />
            <span>{venueName || venueAddress ? `${venueName}${venueName && venueAddress ? " · " : ""}${venueAddress}` : "Chưa chọn địa điểm"}</span>
          </div>
        </div>

        {description && (
          <div className="mt-6 whitespace-pre-line border-t border-ink-100 pt-6 text-sm leading-relaxed text-ink-600">
            {description}
          </div>
        )}

        {galleryUrls.length > 0 && (
          <div className="mt-6 border-t border-ink-100 pt-6">
            <p className="label mb-3">Ảnh minh họa</p>
            <div className="grid grid-cols-3 gap-2">
              {galleryUrls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="aspect-square w-full rounded-lg object-cover"
                  onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-500">
      <rect x="4" y="5" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-500">
      <path d="M12 21s7-6.5 7-11.5A7 7 0 105 9.5C5 14.5 12 21 12 21Z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="9.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
