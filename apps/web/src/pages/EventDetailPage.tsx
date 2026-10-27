import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiErrorMessage } from "../api/client";
import { eventsApi } from "../api/events";
import { bookingApi, type HoldCartItem } from "../api/booking";
import type { Seat, SeatMapData, SeatStatus, TicketType } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { SeatMapView } from "../components/seatmap/SeatMapView";
import { WaitingRoomScreen } from "../components/events/WaitingRoomScreen";
import { Badge } from "../components/ui/Badge";
import { RecommendedEvents } from "../components/events/RecommendedEvents";
import { ShowtimeSchedule } from "../components/events/ShowtimeSchedule";
import { TicketTierList, ZoneMap } from "../components/events/TicketTierList";
import { MemberBenefitsBox } from "../components/events/MemberBenefitsBox";
import { ResaleListingCard, useResaleContext } from "../components/resale/ResaleListingCard";
import { resaleApi } from "../api/resale";
import { RichContent } from "../components/ui/RichContent";
import { RichText } from "../components/ui/RichText";
import { PageSpinner } from "../components/ui/Spinner";
import { useFavorites } from "../hooks/useFavorites";
import { useWaitingRoom } from "../hooks/useWaitingRoom";
import { formatDateTime, formatVnd } from "../lib/format";
import { getQueueSessionId } from "../lib/session";

export function EventDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const sessionId = getQueueSessionId();

  const {
    data: event,
    isLoading,
    error: eventError,
  } = useQuery({ queryKey: ["event", id], queryFn: () => eventsApi.getById(id, sessionId) });

  const onAdmitted = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["event", id] });
    qc.invalidateQueries({ queryKey: ["seat-map-state", id] });
  }, [qc, id]);
  const waitingRoom = useWaitingRoom(id, eventError, onAdmitted);
  const favorites = useFavorites(event ? [event.id] : []);

  const isSeatMap = event?.ticketMode === "SEATMAP";
  const isFreeEntry = event?.ticketMode === "FREE_ENTRY";

  const { data: layout } = useQuery({
    queryKey: ["seat-map-layout", id],
    queryFn: () => eventsApi.seatMap.getLayout(id),
    enabled: isSeatMap && waitingRoom.locked !== true,
  });
  const { data: state } = useQuery({
    queryKey: ["seat-map-state", id],
    queryFn: () => eventsApi.seatMap.getState(id, sessionId),
    enabled: isSeatMap && waitingRoom.locked !== true,
    // Read-path design (docs/spec/04-deployment-design.md §2a): poll instead
    // of a WS subscription so other shoppers' holds/releases show up live.
    refetchInterval: 3000,
  });
  // Merge the two into the shape SeatMapView expects — it doesn't need to
  // know layout and state came from separate cached/polled requests.
  const seatMap: SeatMapData | undefined = layout
    ? {
        id: layout.id,
        eventId: layout.eventId,
        canvas: layout.canvas ?? null,
        zones: layout.zones.map((z) => ({
          ...z,
          seatMapId: layout.id,
          seats: z.seats.map((s) => ({ ...s, zoneId: z.id, status: (state?.[s.id] ?? "AVAILABLE") as SeatStatus })),
        })),
      }
    : undefined;

  const { data: memberBenefits } = useQuery({
    queryKey: ["member-benefits", id, isAuthenticated],
    queryFn: () => eventsApi.memberBenefits(id),
    enabled: !!event?.memberBenefits && !isFreeEntry,
  });

  const { data: resale } = useQuery({ queryKey: ["resale", "listings", "event", id], queryFn: () => resaleApi.list({ eventId: id, limit: 6 }), enabled: !!event && !isFreeEntry });
  const resaleCtx = useResaleContext(resale?.data ?? []);

  const [selectedSeats, setSelectedSeats] = useState<Map<string, Seat>>(new Map());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const holdMutation = useMutation({
    // A free registration (0đ) is confirmed right away — there's nothing to pay.
    mutationFn: async (items: HoldCartItem[]) => {
      const order = await bookingApi.hold(id, items);
      return Number(order.totalAmount) === 0 ? bookingApi.confirmFree(order.id) : order;
    },
    onSuccess: (order) => navigate(Number(order.totalAmount) === 0 ? `/don-hang/${order.id}` : `/thanh-toan/${order.id}`),
    onError: (err) => setError(apiErrorMessage(err, "Không thể giữ chỗ — vui lòng thử lại.")),
  });

  function toggleSeat(seat: Seat) {
    setSelectedSeats((prev) => {
      const next = new Map(prev);
      if (next.has(seat.id)) next.delete(seat.id);
      else if (next.size < 8) next.set(seat.id, seat);
      return next;
    });
  }

  function submitHold() {
    setError(null);
    if (!isAuthenticated) {
      navigate("/dang-nhap", { state: { from: { pathname: `/su-kien/${id}` } } });
      return;
    }
    // A seat-map event can mix picked seats with standing-zone tickets (by quantity, via their ticket types).
    const byQuantity: HoldCartItem[] = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    const items: HoldCartItem[] = isSeatMap ? [...[...selectedSeats.keys()].map((seatId) => ({ seatId })), ...byQuantity] : byQuantity;
    if (items.length === 0) {
      setError(isSeatMap ? "Chọn ít nhất một ghế hoặc vé khu đứng." : "Chọn số lượng vé.");
      return;
    }
    holdMutation.mutate(items);
  }

  if (waitingRoom.locked) {
    return <WaitingRoomScreen position={waitingRoom.position} queueLength={waitingRoom.queueLength} />;
  }
  if (isLoading) return <PageSpinner />;
  if (!event) return <div className="container-page py-20 text-center text-ink-500">Không tìm thấy sự kiện.</div>;

  const quantityTotal = Object.entries(quantities).reduce((sum, [ttId, q]) => {
    const tt = event.ticketTypes?.find((t: TicketType) => t.id === ttId);
    return sum + Number(tt?.price ?? 0) * q;
  }, 0);
  const quantityCount = Object.values(quantities).reduce((a, b) => a + b, 0);
  const selectedTotal = isSeatMap
    ? [...selectedSeats.values()].reduce((sum, s) => {
        const zone = seatMap?.zones.find((z) => z.id === s.zoneId);
        return sum + Number(zone?.price ?? 0);
      }, 0) + quantityTotal
    : quantityTotal;
  const selectedCount = isSeatMap ? selectedSeats.size + quantityCount : quantityCount;
  // Event-level sales window, for the summary box — the server (event-service purchase-check) is what enforces it, per tier too.
  const now = Date.now();
  const salesStart = event.salesStartTime ? new Date(event.salesStartTime) : null;
  const lateSalesOpen = !!event.lateSalesUntil && new Date(event.lateSalesUntil).getTime() > now;
  const salesClosed = !lateSalesOpen && (event.salesEndTime ? new Date(event.salesEndTime).getTime() <= now : new Date(event.endTime).getTime() <= now);
  const presaleHours = memberBenefits?.member?.presaleHours ?? 0;
  const notOpenYet = !!salesStart && salesStart.getTime() > now;
  const inPresale = notOpenYet && presaleHours > 0 && salesStart!.getTime() - presaleHours * 3_600_000 <= now;
  const salesBlocked = salesClosed || (notOpenYet && !inPresale);
  const memberDiscount = Math.floor((selectedTotal * (memberBenefits?.member?.discountPercent ?? 0)) / 100);
  const hasOrganizer = Boolean(event.organizerName || event.organizerDescription || event.organizerLogoUrl);
  const hasShowtimes = !isSeatMap && (event.showtimes?.length ?? 0) > 0;
  const sections = [
    { id: "gioi-thieu", label: "Giới thiệu" },
    { id: "thong-tin-ve", label: isFreeEntry ? "Vào cửa" : isSeatMap ? "Chọn ghế" : "Thông tin vé" },
    ...(hasOrganizer ? [{ id: "ban-to-chuc", label: "Ban tổ chức" }] : []),
    ...(event.terms ? [{ id: "dieu-khoan", label: "Điều khoản" }] : []),
  ];

  return (
    <div>
      {/* The whole banner is shown (object-contain, nothing cropped); a blurred copy fills the sides. */}
      <div className="relative h-64 w-full overflow-hidden bg-gradient-to-br from-ink-800 to-ink-900 sm:h-96">
        {event.bannerUrl && (
          <>
            <img src={event.bannerUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
            <img src={event.bannerUrl} alt={event.title} className="relative h-full w-full object-contain" />
          </>
        )}
      </div>

      <div className="container-page -mt-10 grid gap-8 pb-24 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="card relative p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3">
              {event.category && <Badge tone="brand">{event.category.name}</Badge>}
              {favorites.enabled && (
                <button
                  type="button"
                  onClick={() => favorites.toggle(event.id)}
                  className="flex items-center gap-1.5 rounded-full border border-ink-100 px-3 py-1.5 text-sm font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-600"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill={favorites.isFavorited(event.id) ? "#E8462A" : "none"}>
                    <path
                      d="M12 20s-7.5-4.6-9.7-9A5.4 5.4 0 0112 6.5 5.4 5.4 0 0121.7 11c-2.2 4.4-9.7 9-9.7 9Z"
                      stroke={favorites.isFavorited(event.id) ? "#E8462A" : "currentColor"}
                      strokeWidth="1.8"
                    />
                  </svg>
                  {favorites.isFavorited(event.id) ? "Đã lưu" : "Lưu sự kiện"}
                </button>
              )}
            </div>
            <h1 className="mt-3 text-3xl">{event.title}</h1>

            <div className="mt-5 space-y-3 text-sm">
              <InfoRow
                icon="calendar"
                text={
                  hasShowtimes && event.showtimes!.length > 1
                    ? `${event.showtimes!.length} suất diễn · từ ${formatDateTime(event.startTime)} đến ${formatDateTime(event.endTime)}`
                    : `${formatDateTime(event.startTime)} — ${formatDateTime(event.endTime)}`
                }
              />
              <InfoRow icon="pin" text={`${event.venueName} · ${event.venueAddress}`} />
              {event.minAge != null && event.minAge > 0 && (
                <p>
                  <Badge tone="warning">Dành cho khán giả từ {event.minAge} tuổi trở lên</Badge>
                </p>
              )}
            </div>
          </div>

          <nav className="sticky top-16 z-10 mt-6 flex gap-1 overflow-x-auto rounded-xl border border-ink-100 bg-white/95 p-1.5 text-sm font-semibold backdrop-blur">
            {sections.map((sec) => (
              <a key={sec.id} href={`#${sec.id}`} className="whitespace-nowrap rounded-lg px-4 py-2 text-ink-600 hover:bg-ink-50 hover:text-brand-600">
                {sec.label}
              </a>
            ))}
          </nav>

          <section id="gioi-thieu" className="card mt-6 scroll-mt-32 p-6 sm:p-8">
            <h2 className="text-xl">Giới thiệu</h2>
            {event.description ? (
              <RichContent value={event.description} className="mt-4" />
            ) : (
              <p className="mt-4 text-sm text-ink-400">Ban tổ chức chưa cập nhật mô tả cho sự kiện này.</p>
            )}

            {event.galleryUrls.length > 0 && (
              <div className="mt-6 border-t border-ink-100 pt-6">
                <p className="label mb-3">Ảnh minh họa</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {event.galleryUrls.map((url) => (
                    <img key={url} src={url} alt="" className="aspect-square w-full rounded-xl object-cover" />
                  ))}
                </div>
              </div>
            )}

            {event.lineup && event.lineup.length > 0 && (
              <div className="mt-6 border-t border-ink-100 pt-6">
                <p className="label mb-3">Nghệ sĩ tham gia</p>
                <div className="flex flex-wrap gap-4">
                  {event.lineup.map((l) => (
                    <Link
                      key={l.id}
                      to={`/nghe-si/${l.artist.id}`}
                      className="flex items-center gap-2 rounded-full border border-ink-100 py-1.5 pl-1.5 pr-4 text-sm font-semibold text-ink-700 hover:border-brand-300"
                    >
                      {l.artist.avatarUrl ? (
                        <img src={l.artist.avatarUrl} alt={l.artist.name} className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 text-xs font-bold text-white">
                          {l.artist.name[0]?.toUpperCase()}
                        </span>
                      )}
                      {l.artist.name}
                      {l.artist.isVerified && <span className="text-emerald-500">✓</span>}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {event.isOnline ? (
              <div className="mt-6 border-t border-ink-100 pt-6">
                <p className="label">Địa điểm</p>
                <p className="text-sm text-ink-600">
                  <span className="font-semibold text-ink-800">Sự kiện trực tuyến</span> · {event.venueName}. Link tham gia hiển thị trong vé của bạn sau khi mua.
                </p>
              </div>
            ) : (
              <div className="mt-6 border-t border-ink-100 pt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="label mb-0">Địa điểm</p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venueName}, ${event.venueAddress}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-brand-600 hover:underline"
                  >
                    Mở Google Maps ↗
                  </a>
                </div>
                <p className="mb-3 text-sm text-ink-600">
                  <span className="font-semibold text-ink-800">{event.venueName}</span> · {event.venueAddress}
                </p>
                <iframe
                  title="Bản đồ địa điểm"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(`${event.venueName}, ${event.venueAddress}`)}&output=embed`}
                  className="h-64 w-full rounded-xl border border-ink-100"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}
          </section>

          <section id="thong-tin-ve" className="card mt-6 scroll-mt-32 p-6 sm:p-8">
            <h2 className="text-xl">{isFreeEntry ? "Vào cửa" : isSeatMap ? "Chọn ghế" : "Thông tin vé"}</h2>
            {event.maxTicketsPerAccount != null && (
              <p className="mt-1 text-sm text-ink-500">Mỗi tài khoản tối đa {event.maxTicketsPerAccount} vé cho sự kiện này.</p>
            )}
            {memberBenefits && <MemberBenefitsBox benefits={memberBenefits} salesStart={salesStart} />}
            {event.zoneMapUrl && (
              <div className="mt-5">
                <p className="label mb-2">Sơ đồ hạng mục vé</p>
                <ZoneMap url={event.zoneMapUrl} alt={`Sơ đồ khu vực — ${event.title}`} />
              </div>
            )}
            <div className="mt-5">
              {isFreeEntry ? (
                <p className="rounded-xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                  <strong>Vào cửa tự do — miễn phí, không cần vé hay đăng ký.</strong> Bạn chỉ cần có mặt đúng giờ tại địa điểm.
                </p>
              ) : isSeatMap ? (
                seatMap ? (
                  <SeatMapView
                    seatMap={seatMap}
                    selectedSeatIds={new Set(selectedSeats.keys())}
                    onToggleSeat={toggleSeat}
                    standing={{
                      ticketTypes: event.ticketTypes ?? [],
                      quantities,
                      onQuantityChange: (ticketTypeId, quantity) => setQuantities((q) => ({ ...q, [ticketTypeId]: quantity })),
                    }}
                  />
                ) : (
                  <PageSpinner />
                )
              ) : hasShowtimes ? (
                  <ShowtimeSchedule
                    showtimes={event.showtimes!}
                    tiers={event.ticketTypes ?? []}
                    quantities={quantities}
                    onQuantitiesChange={setQuantities}
                    maxTicketsPerAccount={event.maxTicketsPerAccount}
                    onBuy={submitHold}
                    buying={holdMutation.isPending}
                    error={error}
                  />
              ) : (
                  <TicketTierList
                    tiers={event.ticketTypes ?? []}
                    quantities={quantities}
                    onChange={(tierId, v) => setQuantities((q) => ({ ...q, [tierId]: v }))}
                    maxTicketsPerAccount={event.maxTicketsPerAccount}
                  />
              )}
            </div>
          </section>

          {hasOrganizer && (
            <section id="ban-to-chuc" className="card mt-6 scroll-mt-32 p-6 sm:p-8">
              <h2 className="text-xl">Ban tổ chức</h2>
              <div className="mt-4 flex items-start gap-4">
                {event.organizerLogoUrl ? (
                  <img src={event.organizerLogoUrl} alt={event.organizerName ?? ""} className="h-16 w-16 shrink-0 rounded-xl border border-ink-100 object-cover" />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-xl font-bold text-white">
                    {(event.organizerName ?? "?")[0]?.toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  {event.organizerName && <p className="text-base font-bold text-ink-900">{event.organizerName}</p>}
                  {event.organizerDescription && <RichText text={event.organizerDescription} className="mt-1" />}
                </div>
              </div>
            </section>
          )}

          {event.terms && (
            <section id="dieu-khoan" className="card mt-6 scroll-mt-32 p-6 sm:p-8">
              <h2 className="text-xl">Điều khoản & lưu ý</h2>
              <RichText text={event.terms} className="mt-4" />
            </section>
          )}
        </div>

        <aside className="lg:col-span-1">
          {isFreeEntry ? (
            <div className="card sticky top-24 p-6 text-center">
              <p className="text-2xl font-extrabold text-emerald-600">Miễn phí</p>
              <p className="mt-2 text-sm text-ink-600">Vào cửa tự do, không cần vé.</p>
            </div>
          ) : (
          <div className="card sticky top-24 p-6">
            <p className="text-sm font-semibold text-ink-500">Tóm tắt</p>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-ink-500">Đã chọn</span>
              <span className="font-semibold">{selectedCount} {isSeatMap ? "ghế" : "vé"}</span>
            </div>
            {memberDiscount > 0 && (
              <div className="mt-2 flex items-center justify-between text-sm text-emerald-600">
                <span>Ưu đãi thành viên −{memberBenefits!.member!.discountPercent}%</span>
                <span className="font-semibold">−{formatVnd(memberDiscount)}</span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between text-base">
              <span className="font-bold text-ink-800">Tạm tính</span>
              <span className="font-extrabold text-brand-600">{selectedCount > 0 && selectedTotal === 0 ? "Miễn phí" : formatVnd(selectedTotal - memberDiscount)}</span>
            </div>
            {salesClosed ? (
              <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
                Đã hết thời gian bán vé.{" "}
                {(resale?.total ?? 0) > 0 && (
                  <a href="#ve-ban-lai" className="font-semibold text-brand-600 hover:underline">
                    Xem vé bán lại
                  </a>
                )}
              </p>
            ) : lateSalesOpen ? (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Ban tổ chức mở bán lại vé còn trống đến {formatDateTime(event.lateSalesUntil!)}.
              </p>
            ) : inPresale ? (
              <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
                Bạn đang mua sớm dành cho thành viên — mở bán chung lúc {formatDateTime(event.salesStartTime!)}.
              </p>
            ) : notOpenYet ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Vé mở bán lúc {formatDateTime(event.salesStartTime!)}.</p>
            ) : null}
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <button
              onClick={submitHold}
              disabled={holdMutation.isPending || selectedCount === 0 || salesBlocked}
              className="btn-primary mt-5 w-full py-3 text-base"
            >
              {holdMutation.isPending
                ? "Đang xử lý..."
                : selectedCount > 0 && selectedTotal === 0
                  ? "Đăng ký miễn phí"
                  : "Giữ chỗ & thanh toán"}
            </button>
            <p className="mt-3 text-center text-xs text-ink-400">
              {selectedCount > 0 && selectedTotal === 0 ? "Vé miễn phí — đăng ký xong là có vé ngay." : "Chỗ được giữ trong 10 phút để bạn hoàn tất thanh toán."}
            </p>
          </div>
          )}
        </aside>
      </div>

      {resale && resale.data.length > 0 && (
        <section id="ve-ban-lai" className="mt-10 scroll-mt-32">
          <div className="flex items-center justify-between">
            <h2 className="text-xl">Vé bán lại ({resale.total})</h2>
            <Link to="/ban-lai-ve" className="text-sm font-semibold text-brand-600 hover:underline">
              Xem tất cả vé bán lại
            </Link>
          </div>
          <p className="mt-1 text-sm text-ink-500">Vé khách không thể tham dự rao bán lại — giá không cao hơn giá gốc, bạn nhận vé mới với mã QR riêng.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resale.data.map((l) => (
              <ResaleListingCard key={l.id} listing={l} event={event} zone={resaleCtx.zoneLabel(l)} compact />
            ))}
          </div>
        </section>
      )}

      <RecommendedEvents eventId={event.id} />
    </div>
  );
}

function InfoRow({ icon, text }: { icon: "calendar" | "pin"; text: string }) {
  return (
    <div className="flex items-start gap-2.5 text-ink-600">
      <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-500">
        {icon === "calendar" ? (
          <>
            <rect x="4" y="5" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M12 21s7-6.5 7-11.5A7 7 0 105 9.5C5 14.5 12 21 12 21Z" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="12" cy="9.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
          </>
        )}
      </svg>
      <span>{text}</span>
    </div>
  );
}
