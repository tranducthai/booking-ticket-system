import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { bookingApi, ORDER_STATUS_LABEL } from "../api/booking";
import { eventsApi } from "../api/events";
import { ticketsApi } from "../api/tickets";
import type { EventItem, Order, OrderStatus, Ticket } from "../api/types";
import { AccountLayout } from "../components/account/AccountLayout";
import { EventCard, EventCardSkeleton } from "../components/events/EventCard";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "../components/ui/Badge";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTimeRange, formatVnd } from "../lib/format";

type Tab = "upcoming" | "ended" | "canceled";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "upcoming", label: "Sắp tới" },
  { key: "ended", label: "Đã kết thúc" },
  { key: "canceled", label: "Vé đã hủy" },
];

const BOUGHT: OrderStatus[] = ["PAID", "TICKET_ISSUED"];

const STATUS_TONE: Record<OrderStatus, "success" | "warning" | "neutral" | "danger"> = {
  PENDING_PAYMENT: "warning",
  PAID: "success",
  TICKET_ISSUED: "success",
  CANCELED: "neutral",
  EXPIRED: "danger",
};

/**
 * "Vé của tôi" — Ticketbox's my-tickets: every order as a ticket card with its
 * event (date, venue), filtered by Sắp tới / Đã kết thúc / Vé đã hủy. Each card shows its e-tickets (QR) and links to the order.
 */
export function TicketsPage() {
  const [tab, setTab] = useState<Tab>("upcoming");

  const { data: orders, isLoading } = useQuery({ queryKey: ["orders", "mine"], queryFn: () => bookingApi.myOrders({ limit: 50 }) });
  const { data: tickets } = useQuery({ queryKey: ["tickets", "mine"], queryFn: () => ticketsApi.mine({ limit: 100 }) });

  // Membership-card orders have no event and no tickets — they live under "Thẻ thành viên của tôi".
  // An order still awaiting payment isn't a purchase yet (it expires by itself), so it isn't listed.
  const ticketOrders = useMemo(
    () => (orders?.data ?? []).filter((o): o is Order & { eventId: string } => !!o.eventId && o.status !== "PENDING_PAYMENT" && o.status !== "EXPIRED"),
    [orders],
  );
  const eventIds = useMemo(() => [...new Set(ticketOrders.map((o) => o.eventId))], [ticketOrders]);
  const eventQueries = useQueries({
    queries: eventIds.map((id) => ({
      queryKey: ["event", id],
      queryFn: () => eventsApi.getById(id),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });
  const events = new Map<string, EventItem>();
  eventQueries.forEach((q) => q.data && events.set(q.data.id, q.data));

  const ticketsByItem = useMemo(() => new Map((tickets?.data ?? []).map((t) => [t.orderItemId, t])), [tickets]);

  const now = Date.now();
  const visible = ticketOrders.filter((order) => {
    // Tickets put up for resale live on "Vé đang bán lại", not here: an order whose tickets are all listed is hidden.
    const orderTickets = order.items.map((i) => ticketsByItem.get(i.id)).filter((t): t is Ticket => !!t);
    if (orderTickets.length > 0 && orderTickets.every((t) => t.status === "RESALE_LISTED")) return false;
    if (tab === "canceled") return order.status === "CANCELED";
    const bought = BOUGHT.includes(order.status);
    // "Sắp tới" / "Đã kết thúc" only list tickets that were actually bought.
    const event = events.get(order.eventId);
    const ended = event ? new Date(event.endTime).getTime() < now : false;
    return bought && (tab === "ended" ? ended : !ended);
  });

  return (
    <AccountLayout title="Vé của tôi" crumbs={[{ label: "Đơn hàng của tôi", to: "/orders" }, { label: "Vé của tôi" }]}>
      <div className="grid grid-cols-3 gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              tab === t.key ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-500 hover:bg-ink-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {isLoading ? (
          <PageSpinner />
        ) : visible.length === 0 ? (
          <EmptyTickets />
        ) : (
          <div className="space-y-4">
            {visible.map((order) => (
              <OrderTicketCard key={order.id} order={order} event={events.get(order.eventId)} ticketsByItem={ticketsByItem} />
            ))}
          </div>
        )}
      </div>

      <YouMayAlsoLike />
    </AccountLayout>
  );
}

function OrderTicketCard({ order, event, ticketsByItem }: { order: Order; event?: EventItem; ticketsByItem: Map<string, Ticket> }) {
  const start = event ? new Date(event.startTime) : null;
  const orderTickets = order.items.map((i) => ticketsByItem.get(i.id)).filter((t): t is Ticket => !!t);
  const eventOver = event ? new Date(event.endTime).getTime() < Date.now() : false;

  return (
    <div className="card flex overflow-hidden">
      <div className="flex w-24 shrink-0 flex-col items-center justify-center bg-ink-900 px-3 py-4 text-white sm:w-28">
        {start ? (
          <>
            <span className="text-3xl font-extrabold leading-none">{String(start.getDate()).padStart(2, "0")}</span>
            <span className="mt-1 text-xs font-semibold text-brand-300">Tháng {start.getMonth() + 1}</span>
            <span className="text-xs text-white/60">{start.getFullYear()}</span>
          </>
        ) : (
          <span className="text-xs text-white/60">—</span>
        )}
      </div>

      <div className="min-w-0 flex-1 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {event ? (
            <Link to={`/events/${event.id}`} className="line-clamp-2 font-bold text-ink-900 hover:text-brand-600">
              {event.title}
            </Link>
          ) : (
            <span className="font-bold text-ink-500">Sự kiện không còn hiển thị</span>
          )}
          <Badge tone={STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
        </div>

        <div className="mt-2 space-y-1 text-sm text-ink-600">
          <p>
            Mã đơn hàng: <span className="font-mono font-semibold text-ink-800">#{order.id.slice(0, 8)}</span> · {formatVnd(order.totalAmount)}
          </p>
          {event && (
            <>
              <p>
                {formatDateTimeRange(event.startTime, event.endTime)}
              </p>
              <p className="truncate">{event.isOnline ? `Sự kiện trực tuyến · ${event.venueName}` : `${event.venueName} · ${event.venueAddress}`}</p>
            </>
          )}
        </div>

        {orderTickets.some((t) => t.status === "ISSUED") && !eventOver && (
          <div className="mt-4 flex flex-wrap gap-4">
            {orderTickets.map((t) => t.status === "ISSUED" && <TicketQr key={t.id} ticketId={t.id} />)}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex-1" />
          <Link to={`/orders/${order.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
            Chi tiết đơn →
          </Link>
        </div>
      </div>
    </div>
  );
}

/** The list endpoint never carries the QR (docs/spec/13 §3.4), so each ticket's owner-checked detail is fetched for its code. */
function TicketQr({ ticketId }: { ticketId: string }) {
  const { data: ticket } = useQuery({ queryKey: ["ticket", ticketId], queryFn: () => ticketsApi.get(ticketId) });
  if (!ticket?.qrPayload) return null;
  return (
    <Link to={`/my-tickets/${ticketId}`} title="Xem chi tiết vé" className="rounded-2xl bg-white p-3 shadow-card ring-1 ring-ink-100">
      <QRCodeSVG value={ticket.qrPayload} size={140} />
    </Link>
  );
}

function EmptyTickets() {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <svg viewBox="0 0 200 200" className="h-44 w-44" aria-hidden>
        <defs>
          <clipPath id="empty-tickets-circle">
            <circle cx="100" cy="100" r="96" />
          </clipPath>
        </defs>
        <g clipPath="url(#empty-tickets-circle)">
          <rect width="200" height="200" fill="#f6c58f" />
          <circle cx="140" cy="62" r="26" fill="#fde68a" />
          <rect y="70" width="200" height="45" fill="#e2603b" />
          <path d="M0 112c25-8 45 6 70-2s50-10 80-2 40 6 50 2v90H0z" fill="#efe4d3" />
          <path d="M85 200l20-70 12 0-8 70z" fill="#3f3f46" opacity="0.6" />
        </g>
        <g transform="translate(78 92)">
          <ellipse cx="22" cy="20" rx="20" ry="18" fill="#d4a017" />
          <ellipse cx="22" cy="20" rx="13" ry="10" fill="#7c5d0a" opacity="0.5" />
          <rect x="6" y="34" width="32" height="30" rx="12" fill="#d4a017" />
          <rect x="10" y="60" width="9" height="12" rx="4" fill="#b8860b" />
          <rect x="25" y="60" width="9" height="12" rx="4" fill="#b8860b" />
        </g>
      </svg>
      <p className="mt-4 text-sm text-ink-500">Bạn chưa có vé nào</p>
      <Link to="/events" className="btn-primary mt-5 px-6">
        Mua vé ngay
      </Link>
    </div>
  );
}

/** Upcoming published events — "Có thể bạn cũng thích" under the list, like Ticketbox. */
function YouMayAlsoLike() {
  const { data, isLoading } = useQuery({
    queryKey: ["events", "upcoming-suggestions"],
    queryFn: () => eventsApi.search({ limit: 4, startDateFrom: new Date().toISOString() }),
    staleTime: 5 * 60_000,
  });
  if (!isLoading && !data?.data.length) return null;

  return (
    <section className="mt-12 border-t border-ink-100 pt-8">
      <h2 className="text-center text-lg font-bold">Có thể bạn cũng thích</h2>
      <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        {isLoading ? Array.from({ length: 4 }).map((_, i) => <EventCardSkeleton key={i} />) : data?.data.map((e) => <EventCard key={e.id} event={e} />)}
      </div>
    </section>
  );
}
