import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { membershipsApi } from "../../api/artists";
import { bookingApi } from "../../api/booking";
import { apiErrorMessage } from "../../api/client";
import type { ArtistDetail } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { formatDate, formatVnd } from "../../lib/format";

/**
 * The artist page's "Thẻ thành viên" box: what the card gives, and a button
 * to buy it (paid → the normal checkout; free → active at once). A current
 * member sees their card and can renew.
 */
export function MembershipOffer({ artist }: { artist: ArtistDetail }) {
  const plan = artist.membershipPlan;
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { data: myCards } = useQuery({
    queryKey: ["memberships", "mine", "active"],
    queryFn: () => membershipsApi.mine("active"),
    enabled: isAuthenticated && !!plan,
  });
  const mine = myCards?.filter((m) => m.artistId === artist.id) ?? [];
  const latest = mine.at(-1);

  const buy = useMutation({
    mutationFn: () => bookingApi.membershipCheckout(plan!.id),
    onSuccess: (order) => navigate(order.status === "PAID" ? "/memberships" : `/checkout/${order.id}`),
    onError: (err) => setError(apiErrorMessage(err, "Không thể đăng ký thẻ thành viên.")),
  });

  if (!plan) return null;
  const free = Number(plan.price) === 0;
  const perks = [
    plan.discountPercent > 0 && `Giảm ${plan.discountPercent}% giá vé các sự kiện có ${artist.name} tham gia chương trình`,
    plan.presaleHours > 0 && `Mua vé sớm ${plan.presaleHours} giờ trước giờ mở bán chung`,
    ...(plan.benefits ?? "")
      .split("\n")
      .map((l) => l.replace(/^[-•]\s*/, "").trim())
      .filter(Boolean),
  ].filter((p): p is string => !!p);

  return (
    <section className="mt-10 overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white">
      <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Thẻ thành viên</p>
          <h2 className="mt-1 text-xl">{plan.name}</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-700">
            {perks.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="text-brand-500">✓</span>
                {p}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-500">
            Thời hạn {plan.durationDays} ngày. Ưu đãi áp dụng cho sự kiện được ban tổ chức bật "Ưu đãi thành viên".
          </p>
        </div>

        <div className="rounded-xl bg-white p-5 text-center shadow-sm sm:w-64">
          {latest ? (
            <>
              <p className="text-sm font-semibold text-emerald-600">Bạn là thành viên</p>
              <p className="mt-1 font-mono text-sm text-ink-700">{latest.cardNumber}</p>
              <p className="mt-1 text-xs text-ink-500">Hết hạn {formatDate(latest.expiresAt)}</p>
            </>
          ) : (
            <p className="text-2xl font-extrabold text-brand-600">{free ? "Miễn phí" : formatVnd(plan.price)}</p>
          )}
          {plan.isActive ? (
            <button
              onClick={() => {
                setError(null);
                if (!isAuthenticated) {
                  navigate("/login", { state: { from: { pathname: `/artists/${artist.id}` } } });
                  return;
                }
                buy.mutate();
              }}
              disabled={buy.isPending}
              className="btn-primary mt-4 w-full"
            >
              {buy.isPending ? "Đang xử lý..." : latest ? `Gia hạn${free ? "" : ` · ${formatVnd(plan.price)}`}` : free ? "Đăng ký thành viên" : "Mua thẻ thành viên"}
            </button>
          ) : (
            <p className="mt-4 text-sm text-ink-500">Tạm ngừng đăng ký</p>
          )}
          {latest && (
            <Link to="/memberships" className="mt-2 block text-xs font-semibold text-brand-600 hover:underline">
              Xem thẻ của tôi
            </Link>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </section>
  );
}
