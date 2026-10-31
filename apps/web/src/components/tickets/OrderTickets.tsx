import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";
import { TICKET_STATUS_LABEL, TICKET_STATUS_TONE, ticketsApi } from "../../api/tickets";
import type { EventItem, Order } from "../../api/types";
import { formatDateTime } from "../../lib/format";
import { orderItemLabel } from "../../lib/orderTickets";
import { Badge } from "../ui/Badge";

/** The e-tickets of one order: details and the QR (the QR comes only from the owner-checked single-ticket read). */
export function OrderTickets({ order, event }: { order: Order; event?: EventItem }) {
  const { data: tickets } = useQuery({
    queryKey: ["tickets", "mine", "event", order.eventId],
    queryFn: () => ticketsApi.mine({ eventId: order.eventId ?? undefined, limit: 100 }),
  });
  const byItem = new Map((tickets?.data ?? []).map((t) => [t.orderItemId, t]));
  const rows = order.items.flatMap((item, index) => {
    const ticket = byItem.get(item.id);
    return ticket ? [{ item, index, ticketId: ticket.id }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <section className="mt-4">
      <h2 className="text-base font-bold text-ink-800">Vé của đơn hàng</h2>
      <div className="mt-3 space-y-4">
        {rows.map(({ item, index, ticketId }) => (
          <TicketCard key={ticketId} ticketId={ticketId} label={orderItemLabel(item, event, index)} />
        ))}
      </div>
    </section>
  );
}

function TicketCard({ ticketId, label }: { ticketId: string; label: string }) {
  const { data: ticket } = useQuery({ queryKey: ["ticket", ticketId], queryFn: () => ticketsApi.get(ticketId) });
  if (!ticket) return <div className="card h-40 animate-pulse bg-ink-50" />;

  return (
    <div className="card flex flex-col gap-5 p-5 sm:flex-row">
      <div className="flex shrink-0 flex-col items-center justify-center sm:w-48">
        {ticket.qrPayload ? (
          <div className="rounded-2xl bg-white p-3 shadow-card ring-1 ring-ink-100">
            <QRCodeSVG value={ticket.qrPayload} size={150} />
          </div>
        ) : (
          <p className="px-2 text-center text-xs text-ink-500">
            {ticket.status === "USED" ? "Vé đã được dùng để check-in." : ticket.status === "CANCELED" ? "Vé đã bị hủy." : "Mã QR tạm khóa."}
          </p>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold text-ink-900">{label}</p>
          <Badge tone={TICKET_STATUS_TONE[ticket.status]}>{TICKET_STATUS_LABEL[ticket.status]}</Badge>
        </div>
        <Row label="Mã vé">
          <span className="break-all font-mono text-xs">{ticket.id}</span>
        </Row>
        <Row label="Phát hành">{formatDateTime(ticket.createdAt)}</Row>
        {ticket.checkedInAt && <Row label="Check-in lúc">{formatDateTime(ticket.checkedInAt)}</Row>}
        <Link to={`/my-tickets/${ticket.id}`} className="inline-block pt-1 font-semibold text-brand-600 hover:underline">
          Xem chi tiết vé →
        </Link>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-ink-500">{label}</span>
      <span className="min-w-0 text-right font-semibold text-ink-800">{children}</span>
    </div>
  );
}
