import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { artistsApi } from "../../api/artists";
import { apiErrorMessage } from "../../api/client";
import { check, rules } from "../../lib/validation";
import { formatVnd } from "../../lib/format";

const EMPTY = { name: "", price: "0", durationDays: "365", discountPercent: "10", presaleHours: "48", benefits: "", isActive: true };

/**
 * Admin: an artist's membership card ("Thẻ thành viên") — price (0 = free
 * registration), duration, and the perks on events that opt in to member
 * benefits: a ticket discount and early access before general sale.
 */
export function MembershipPlanEditor({ artistId, artistName }: { artistId: string; artistName: string }) {
  const qc = useQueryClient();
  const { data: artist, isLoading } = useQuery({ queryKey: ["artist", artistId], queryFn: () => artistsApi.getById(artistId) });
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const plan = artist?.membershipPlan;
    setForm(
      plan
        ? {
            name: plan.name,
            price: String(Number(plan.price)),
            durationDays: String(plan.durationDays),
            discountPercent: String(plan.discountPercent),
            presaleHours: String(plan.presaleHours),
            benefits: plan.benefits ?? "",
            isActive: plan.isActive,
          }
        : { ...EMPTY, name: `Fan Club ${artistName}` },
    );
  }, [artist, artistName]);

  const save = useMutation({
    mutationFn: () => {
      check(
        rules.length(form.name, "Tên thẻ", 3, 100),
        rules.money(form.price, "giá thẻ"),
        rules.int(form.durationDays, "Thời hạn (ngày)", 7, 730),
        rules.int(form.discountPercent, "Mức giảm giá (%)", 0, 50),
        rules.int(form.presaleHours, "Số giờ mua sớm", 0, 336),
        form.benefits.length > 2000 ? "Quyền lợi khác tối đa 2000 ký tự" : null,
      );
      return artistsApi.savePlan(artistId, {
        name: form.name.trim(),
        price: Number(form.price),
        durationDays: Number(form.durationDays),
        discountPercent: Number(form.discountPercent),
        presaleHours: Number(form.presaleHours),
        benefits: form.benefits.trim() || null,
        isActive: form.isActive,
      });
    },
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["artist", artistId] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể lưu thẻ thành viên.")),
  });

  if (isLoading) return <p className="text-sm text-ink-400">Đang tải...</p>;
  const set = (patch: Partial<typeof form>) => {
    setSaved(false);
    setForm({ ...form, ...patch });
  };

  return (
    <div className="space-y-4 rounded-xl bg-ink-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Tên thẻ</label>
          <input value={form.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Giá (VND) — 0 = đăng ký miễn phí</label>
          <input type="number" min={0} step={1000} value={form.price} onChange={(e) => set({ price: e.target.value })} className="input" />
          {Number(form.price) > 0 && <p className="mt-1 text-xs text-ink-400">{formatVnd(Number(form.price))}</p>}
        </div>
        <div>
          <label className="label">Thời hạn (ngày)</label>
          <input type="number" min={7} max={730} value={form.durationDays} onChange={(e) => set({ durationDays: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Giảm giá vé (%)</label>
          <input type="number" min={0} max={50} value={form.discountPercent} onChange={(e) => set({ discountPercent: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Mua sớm trước giờ mở bán (giờ)</label>
          <input type="number" min={0} max={336} value={form.presaleHours} onChange={(e) => set({ presaleHours: e.target.value })} className="input" />
        </div>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-semibold text-ink-700">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="h-4 w-4 accent-brand-500" />
          Đang mở đăng ký
        </label>
      </div>
      <div>
        <label className="label">Quyền lợi khác</label>
        <textarea
          value={form.benefits}
          onChange={(e) => set({ benefits: e.target.value })}
          className="input min-h-[70px]"
          placeholder={"- Quà tặng thành viên tại sự kiện\n- Ưu tiên check-in cổng riêng"}
        />
      </div>
      <p className="text-xs text-ink-500">
        Giảm giá và mua sớm chỉ áp dụng cho sự kiện có nghệ sĩ này trong lineup và ban tổ chức bật "Ưu đãi thẻ thành viên". Sửa thẻ không ảnh
        hưởng thẻ người dùng đã mua.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
          {save.isPending ? "Đang lưu..." : artist?.membershipPlan ? "Lưu thẻ thành viên" : "Tạo thẻ thành viên"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Đã lưu ✓</span>}
      </div>
    </div>
  );
}
