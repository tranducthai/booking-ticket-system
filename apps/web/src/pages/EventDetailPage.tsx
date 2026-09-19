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
        zones: layout.zones.map((z) => ({
          ...z,
          seatMapId: layout.id,
          seats: z.seats.map((s) => ({ ...s, zoneId: z.id, status: (state?.[s.id] ?? "AVAILABLE") as SeatStatus })),
        })),
      }
    : undefined;

  const [selectedSeats, setSelectedSeats] = useState<Map<string, Seat>>(new Map());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const holdMutation = useMutation({
    mutationFn: (items: HoldCartItem[]) => bookingApi.hold(id, items),
    onSuccess: (order) => navigate(`/thanh-toan/${order.id}`),
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
    const items: HoldCartItem[] = isSeatMap
      ? [...selectedSeats.keys()].map((seatId) => ({ seatId }))
      : Object.entries(quantities)
          .filter(([, q]) => q > 0)
          .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    if (items.length === 0) {
      setError(isSeatMap ? "Chọn ít nhất một ghế." : "Chọn số lượng vé.");
      return;
    }
    holdMutation.mutate(items);
  }

  if (waitingRoom.locked) {
    return <WaitingRoomScreen position={waitingRoom.position} queueLength={waitingRoom.queueLength} />;
  }
  if (isLoading) return <PageSpinner />;
  if (!event) return <div className="container-page py-20 text-center text-ink-500">Không tìm thấy sự kiện.</div>;

  const selectedTotal = isSeatMap
    ? [...selectedSeats.values()].reduce((sum, s) => {
        const zone = seatMap?.zones.find((z) => z.id === s.zoneId);
        return sum + Number(zone?.price ?? 0);
      }, 0)
    : Object.entries(quantities).reduce((sum, [ttId, q]) => {
        const tt = event.ticketTypes?.find((t: TicketType) => t.id === ttId);
        return sum + Number(tt?.price ?? 0) * q;
      }, 0);
  const selectedCount = isSeatMap ? selectedSeats.size : Object.values(quantities).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="h-64 w-full bg-gradient-to-br from-ink-800 to-ink-900 sm:h-80">
        {event.bannerUrl && <img src={event.bannerUrl} alt={event.title} className="h-full w-full object-cover" />}
      </div>

      <div className="container-page -mt-10 grid gap-8 pb-24 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="card p-6 sm:p-8">
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
              <InfoRow icon="calendar" text={`${formatDateTime(event.startTime)} — ${formatDateTime(event.endTime)}`} />
              <InfoRow icon="pin" text={`${event.venueName} · ${event.venueAddress}`} />
            </div>

            {event.description && (
              <div className="mt-6 whitespace-pre-line border-t border-ink-100 pt-6 text-sm leading-relaxed text-ink-600">
                {event.description}
              </div>
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
          </div>

          <div className="card mt-6 p-6 sm:p-8">
            <h2 className="text-xl">{isSeatMap ? "Chọn ghế" : "Chọn vé"}</h2>
            {event.maxTicketsPerAccount != null && (
              <p className="mt-1 text-sm text-ink-500">Mỗi tài khoản tối đa {event.maxTicketsPerAccount} vé cho sự kiện này.</p>
            )}
            <div className="mt-5">
              {isSeatMap ? (
                seatMap ? (
                  <SeatMapView seatMap={seatMap} selectedSeatIds={new Set(selectedSeats.keys())} onToggleSeat={toggleSeat} />
                ) : (
                  <PageSpinner />
                )
              ) : (
                <div className="space-y-3">
                  {event.ticketTypes?.map((tt: TicketType) => {
                    const remaining = tt.quantityTotal - tt.quantitySold;
                    const cap = event.maxTicketsPerAccount != null ? Math.min(remaining, 8, event.maxTicketsPerAccount) : Math.min(remaining, 8);
                    return (
                      <div key={tt.id} className="flex items-center justify-between rounded-xl border border-ink-100 p-4">
                        <div>
                          <p className="flex items-center gap-2 font-bold text-ink-800">
                            {tt.name}
                            <Badge tone={tt.deliveryMethod === "E_TICKET" ? "brand" : "neutral"}>
                              {tt.deliveryMethod === "E_TICKET" ? "Vé điện tử" : "Vé tự in"}
                            </Badge>
                          </p>
                          <p className="text-sm text-ink-500">{formatVnd(tt.price)}</p>
                          <p className="text-xs text-ink-400">{remaining > 0 ? `Còn ${remaining} vé` : "Đã hết vé"}</p>
                        </div>
                        <QuantityStepper
                          value={quantities[tt.id] ?? 0}
                          max={cap}
                          onChange={(v) => setQuantities((q) => ({ ...q, [tt.id]: v }))}
                        />
                      </div>
                    );
                  })}
                  {(!event.ticketTypes || event.ticketTypes.length === 0) && (
                    <p className="text-sm text-ink-500">Ban tổ chức chưa thiết lập loại vé cho sự kiện này.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="lg:col-span-1">
          <div className="card sticky top-24 p-6">
            <p className="text-sm font-semibold text-ink-500">Tóm tắt</p>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-ink-500">Đã chọn</span>
              <span className="font-semibold">{selectedCount} {isSeatMap ? "ghế" : "vé"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-base">
              <span className="font-bold text-ink-800">Tạm tính</span>
              <span className="font-extrabold text-brand-600">{formatVnd(selectedTotal)}</span>
            </div>
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <button
              onClick={submitHold}
              disabled={holdMutation.isPending || selectedCount === 0}
              className="btn-primary mt-5 w-full py-3 text-base"
            >
              {holdMutation.isPending ? "Đang giữ chỗ..." : "Giữ chỗ & thanh toán"}
            </button>
            <p className="mt-3 text-center text-xs text-ink-400">Chỗ được giữ trong 10 phút để bạn hoàn tất thanh toán.</p>
          </div>
        </aside>
      </div>
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

function QuantityStepper({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value === 0}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 font-bold text-ink-600 disabled:opacity-40"
      >
        −
      </button>
      <span className="w-4 text-center font-bold">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 font-bold text-brand-600 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
