import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiErrorMessage } from "../api/client";
import { resaleApi } from "../api/resale";
import { useAuth } from "../auth/AuthContext";
import { useResaleContext } from "../components/resale/ResaleListingCard";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTimeRange, formatVnd } from "../lib/format";

/** Detail page of one resale listing: the ticket being resold (event, showtime, seat/zone, price vs face value) and the buy button. */
export function ResaleDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { data: listing, isLoading, isError } = useQuery({ queryKey: ["resale", "listing", id], queryFn: () => resaleApi.get(id), retry: false });
  const ctx = useResaleContext(listing ? [listing] : []);
  const buy = useMutation({
    mutationFn: () => resaleApi.buy(id),
    onSuccess: (order) => navigate(`/checkout/${order.id}`),
    onError: (err) => setError(apiErrorMessage(err, "Không thể mua vé này.")),
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !listing) {
    return (
      <div className="container-page max-w-3xl py-16">
        <EmptyState title="Tin bán lại không còn" description="Vé có thể đã được bán hoặc người bán đã gỡ tin." />
        <div className="mt-6 text-center">
          <Link to="/resale" className="btn-primary">
            Xem vé bán lại khác
          </Link>
        </div>
      </div>
    );
  }

  const event = ctx.event(listing);
  const discount = Number(listing.facePrice) - Number(listing.price);
  const available = listing.status === "ACTIVE";

  return (
    <div className="container-page max-w-3xl py-10">
      <Link to="/resale" className="text-sm font-semibold text-ink-500 hover:text-ink-700">
        ← Vé bán lại
      </Link>

      <div className="card mt-4 overflow-hidden">
        {event?.bannerUrl && <img src={event.bannerUrl} alt="" className="aspect-[16/7] w-full object-cover" />}
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">Bán lẻ</span>
            <span className="font-mono text-xs text-ink-400">{listing.code}</span>
          </div>
          <h1 className="mt-3 text-2xl">{event?.title ?? "Sự kiện"}</h1>

          <dl className="mt-5 space-y-3 text-sm">
            <Row label="Số lượng">1 vé</Row>
            {event && <Row label="Suất diễn">{formatDateTimeRange(event.startTime, event.endTime)}</Row>}
            {event && <Row label="Địa điểm">{event.isOnline ? `Trực tuyến · ${event.venueName}` : `${event.venueName} · ${event.venueAddress}`}</Row>}
            <Row label="Khu vực">{ctx.zoneLabel(listing)}</Row>
            <Row label="Giá gốc">{formatVnd(listing.facePrice)}</Row>
            <Row label="Trạng thái">
              <Badge tone={available ? "success" : "neutral"}>
                {available ? "Đang bán" : listing.status === "RESERVED" ? "Có người đang thanh toán" : "Đã bán"}
              </Badge>
            </Row>
          </dl>

          <div className="mt-6 flex items-end justify-between gap-4 border-t border-ink-100 pt-5">
            <div>
              <p className="text-xs text-ink-500">Giá / vé</p>
              <p className="text-2xl font-extrabold text-brand-600">{formatVnd(listing.price)}</p>
              {discount > 0 && <p className="text-xs text-ink-400">Rẻ hơn giá gốc {formatVnd(discount)}</p>}
            </div>
            <button
              onClick={() => {
                setError(null);
                if (!isAuthenticated) {
                  navigate("/login", { state: { from: { pathname: `/resale/${id}` } } });
                  return;
                }
                buy.mutate();
              }}
              disabled={!available || buy.isPending}
              className="btn-primary px-6 py-2.5 disabled:cursor-not-allowed disabled:bg-ink-300 disabled:text-ink-500 disabled:shadow-none"
            >
              {buy.isPending ? "Đang giữ..." : "Mua vé"}
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <p className="mt-5 text-xs text-ink-500">Vé cũ bị vô hiệu khi bán xong; bạn nhận vé mới với mã QR riêng ngay sau khi thanh toán.</p>
          {event && (
            <Link to={`/events/${event.id}`} className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">
              Xem trang sự kiện →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-semibold text-ink-800">{children}</dd>
    </div>
  );
}
