import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { membershipsApi } from "../api/artists";
import { apiErrorMessage } from "../api/client";
import type { Membership } from "../api/types";
import { AccountLayout } from "../components/account/AccountLayout";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDate, formatVnd } from "../lib/format";

type Tab = "active" | "expired" | "canceled";

const TABS: Array<{ value: Tab; label: string; empty: string }> = [
  { value: "active", label: "Đang hoạt động", empty: "Bạn chưa có thẻ nào đang hoạt động" },
  { value: "expired", label: "Đã hết hạn", empty: "Bạn chưa có thẻ nào hết hạn" },
  { value: "canceled", label: "Đã huỷ", empty: "Bạn chưa huỷ thẻ nào" },
];

/** "Thẻ thành viên của tôi" — the artist fan-club cards the user bought (Ticketbox's "Thẻ thành viên"). */
export function MembershipsPage() {
  const [tab, setTab] = useState<Tab>("active");
  const { data, isLoading } = useQuery({ queryKey: ["memberships", "mine", tab], queryFn: () => membershipsApi.mine(tab) });
  const current = TABS.find((t) => t.value === tab)!;

  return (
    <AccountLayout title="Thẻ thành viên" crumbs={[{ label: "Đơn hàng của tôi", to: "/orders" }, { label: "Thẻ thành viên" }]}>
      <div className="flex justify-center gap-8">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`border-b-2 pb-1.5 text-base font-bold transition-colors ${
              tab === t.value ? "border-brand-500 text-ink-900" : "border-transparent text-ink-400 hover:text-ink-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {isLoading ? (
          <PageSpinner />
        ) : !data || data.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-ink-500">{current.empty}</p>
            {tab === "active" && (
              <Link to="/artists" className="btn-primary mt-5 inline-flex">
                Khám phá nghệ sĩ
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {data.map((m) => (
              <MembershipCard key={m.id} membership={m} tab={tab} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-10 rounded-xl bg-ink-50 px-5 py-4 text-sm text-ink-600">
        <p className="font-semibold text-ink-800">Thẻ thành viên dùng thế nào?</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Thẻ có hiệu lực cho các sự kiện có nghệ sĩ trong lineup và được ban tổ chức bật "Ưu đãi thành viên".</li>
          <li>Ưu đãi giảm giá được trừ tự động khi bạn mua vé; quyền mua sớm cho phép đặt vé trước giờ mở bán chung.</li>
          <li>Mua thêm khi thẻ còn hạn sẽ gia hạn: thẻ mới bắt đầu khi thẻ hiện tại hết hạn.</li>
        </ul>
      </div>
    </AccountLayout>
  );
}

function MembershipCard({ membership: m, tab }: { membership: Membership; tab: Tab }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useMutation({
    mutationFn: () => membershipsApi.cancel(m.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["memberships"] }),
    onError: (err) => setError(apiErrorMessage(err, "Không thể huỷ thẻ.")),
  });
  const upcoming = new Date(m.startsAt).getTime() > Date.now();
  const dim = tab !== "active";

  return (
    <div className="space-y-2">
      <div
        className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${
          dim ? "bg-gradient-to-br from-ink-500 to-ink-700" : "bg-gradient-to-br from-brand-500 via-brand-600 to-ink-900"
        }`}
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="flex items-center gap-3">
          {m.artist.avatarUrl ? (
            <img src={m.artist.avatarUrl} alt={m.artist.name} className="h-12 w-12 rounded-full object-cover ring-2 ring-white/70" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-xl font-bold">{m.artist.name.charAt(0)}</span>
          )}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-white/70">Thẻ thành viên</p>
            <Link to={`/artists/${m.artist.id}`} className="block truncate text-lg font-extrabold hover:underline">
              {m.artist.name}
            </Link>
          </div>
        </div>
        <p className="mt-5 font-mono text-xl tracking-widest">{m.cardNumber}</p>
        <div className="mt-4 flex items-end justify-between gap-3 text-xs">
          <div>
            <p className="text-white/60">{m.plan.name}</p>
            <p className="mt-0.5 font-semibold">
              {upcoming ? `Hiệu lực từ ${formatDate(m.startsAt)}` : `Hết hạn ${formatDate(m.expiresAt)}`}
            </p>
          </div>
          <div className="text-right font-semibold">
            {m.discountPercent > 0 && <p>Giảm {m.discountPercent}% vé</p>}
            {m.presaleHours > 0 && <p>Mua sớm {m.presaleHours} giờ</p>}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-1 text-xs text-ink-500">
        <span>
          {Number(m.pricePaid) === 0 ? "Đăng ký miễn phí" : `Đã thanh toán ${formatVnd(m.pricePaid)}`}
          {m.canceledAt && ` · Huỷ ngày ${formatDate(m.canceledAt)}`}
        </span>
        {tab === "active" &&
          (confirming ? (
            <span className="flex items-center gap-2">
              <span>Huỷ thẻ, không hoàn tiền?</span>
              <button onClick={() => cancel.mutate()} disabled={cancel.isPending} className="font-semibold text-red-600 hover:underline">
                Huỷ thẻ
              </button>
              <button onClick={() => setConfirming(false)} className="font-semibold text-ink-600 hover:underline">
                Không
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-3">
              <Link to={`/artists/${m.artist.id}`} className="font-semibold text-brand-600 hover:underline">
                Gia hạn
              </Link>
              <button onClick={() => setConfirming(true)} className="font-semibold text-ink-500 hover:text-red-600">
                Huỷ thẻ
              </button>
            </span>
          ))}
      </div>
      {m.plan.benefits && <p className="whitespace-pre-line px-1 text-xs text-ink-500">{m.plan.benefits}</p>}
      {error && <p className="px-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
