import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import type { EventItem } from "../../api/types";
import { ImageField } from "../ui/ImageField";
import { RichTextEditor } from "../ui/RichTextEditor";

/**
 * The descriptive half of an event — description, "Ban tổ chức", terms,
 * age limit. Editable in any status but CANCELED: unlike the date/venue
 * (locked once on sale, see event-service events.service.ts update()),
 * none of this changes what a buyer paid for.
 */
export function EventDetailsEditor({ event }: { event: EventItem }) {
  const qc = useQueryClient();
  const initial = {
    description: event.description ?? "",
    organizerName: event.organizerName ?? "",
    organizerLogoUrl: event.organizerLogoUrl ?? "",
    organizerDescription: event.organizerDescription ?? "",
    terms: event.terms ?? "",
    zoneMapUrl: event.zoneMapUrl ?? "",
    minAge: event.minAge != null ? String(event.minAge) : "",
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const locked = event.status === "CANCELED";

  const mutation = useMutation({
    mutationFn: () =>
      eventsApi.update(event.id, {
        description: form.description,
        organizerName: form.organizerName,
        organizerLogoUrl: form.organizerLogoUrl,
        organizerDescription: form.organizerDescription,
        terms: form.terms,
        zoneMapUrl: form.zoneMapUrl,
        minAge: form.minAge ? Number(form.minAge) : null,
      }),
    onSuccess: () => {
      // PATCH returns the bare row (no ticketTypes/lineup) — refetch rather than setQueryData.
      qc.invalidateQueries({ queryKey: ["event", event.id] });
      setSaved(true);
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể lưu thông tin.")),
  });

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm({ ...form, [key]: e.target.value });
  };

  return (
    <div className="card p-6">
      <h3 className="text-base font-bold text-ink-800">Thông tin chi tiết</h3>
      <p className="mt-1 text-xs text-ink-400">
        Giới thiệu dùng trình soạn thảo (cỡ chữ, màu chữ, căn lề, chèn ảnh). Giới thiệu ban tổ chức và điều khoản hỗ trợ định dạng đơn giản:{" "}
        <code>## </code> tiêu đề, <code>- </code> gạch đầu dòng, <code>**chữ đậm**</code>, dòng trống để xuống đoạn.
      </p>

      <fieldset disabled={locked} className="mt-4 space-y-4">
        <div>
          <label className="label">Giới thiệu sự kiện</label>
          <RichTextEditor value={form.description} onChange={(html) => set("description")({ target: { value: html } })} editable={!locked} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Tên ban tổ chức</label>
            <input value={form.organizerName} onChange={set("organizerName")} className="input" maxLength={120} />
          </div>
          <ImageField
            label="Logo ban tổ chức"
            kind="logo"
            value={form.organizerLogoUrl}
            onChange={(url) => set("organizerLogoUrl")({ target: { value: url } })}
            previewClassName="h-24 w-full object-contain"
          />
        </div>
        <div>
          <label className="label">Giới thiệu ban tổ chức</label>
          <textarea value={form.organizerDescription} onChange={set("organizerDescription")} className="input min-h-[80px]" />
        </div>

        <div>
          <label className="label">Điều khoản & lưu ý</label>
          <textarea
            value={form.terms}
            onChange={set("terms")}
            className="input min-h-[100px]"
            placeholder={"- Vé đã mua không đổi trả trừ khi sự kiện bị hủy\n- Mang theo CCCD khi check-in"}
          />
        </div>

        <ImageField
          label="Sơ đồ hạng mục vé"
          kind="zone-map"
          value={form.zoneMapUrl}
          onChange={(url) => set("zoneMapUrl")({ target: { value: url } })}
          hint="Ảnh sơ đồ các khu vực / hạng vé, hiển thị cạnh danh sách vé."
          previewClassName="max-h-64 w-full object-contain"
        />

        <div className="sm:w-1/2">
          <label className="label">Độ tuổi tối thiểu</label>
          <input type="number" min={0} max={99} value={form.minAge} onChange={set("minAge")} className="input" placeholder="Bỏ trống = mọi lứa tuổi" />
        </div>
      </fieldset>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={locked || !dirty || mutation.isPending}
          className="btn-primary"
        >
          {mutation.isPending ? "Đang lưu..." : "Lưu thông tin"}
        </button>
        {saved && !dirty && <span className="text-sm text-emerald-600">Đã lưu ✓</span>}
      </div>
    </div>
  );
}
