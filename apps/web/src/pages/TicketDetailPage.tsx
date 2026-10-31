import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Link, useParams } from "react-router-dom";
import { TICKET_STATUS_LABEL, TICKET_STATUS_TONE, ticketsApi } from "../api/tickets";
import { ResellBox } from "../components/resale/ResellBox";
import { Badge } from "../components/ui/Badge";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTime } from "../lib/format";

/**
 * One static QR per ticket (docs/spec/13-refund-and-anti-fraud-design.md §3): it
 * carries the holder's CCCD, which the gate compares with their ID card.
 */
export function TicketDetailPage() {
  const { id = "" } = useParams();
  const { data: ticket, isLoading } = useQuery({ queryKey: ["ticket", id], queryFn: () => ticketsApi.get(id) });

  if (isLoading || !ticket) return <PageSpinner />;

  return (
    <div className="container-page max-w-md py-10">
      <Link to="/my-tickets" className="text-sm font-semibold text-ink-500 hover:text-ink-700">
        ← Vé của tôi
      </Link>

      <div className="card mt-4 overflow-hidden">
        <div className="bg-gradient-to-br from-ink-800 to-ink-900 px-6 py-5 text-white">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-300">Vé điện tử</p>
          <p className="mt-1 font-mono text-xs text-ink-300">#{ticket.id}</p>
        </div>

        <div className="flex flex-col items-center border-b border-dashed border-ink-200 p-8">
          {ticket.qrPayload ? (
            <>
              <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100">
                <QRCodeSVG value={ticket.qrPayload} size={200} />
              </div>
              <p className="mt-4 text-center text-xs text-ink-400">
                Mã QR gắn với số CCCD của bạn — mang theo CCCD để đối chiếu khi vào cổng. Không chia sẻ ảnh chụp mã này.
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-ink-500">
              {ticket.status === "REFUND_PENDING"
                ? "Vé đang chờ hoàn tiền nên tạm khóa. Rút yêu cầu hoàn trong mục Đơn hàng nếu bạn muốn tham dự."
                : ticket.status === "RESALE_LISTED"
                  ? "Vé đang được rao bán lại nên tạm khóa. Huỷ tin bán bên dưới nếu bạn muốn tham dự."
                  : ticket.cancelReason === "RESOLD"
                    ? "Vé đã được bán lại cho người khác — mã QR này không còn hiệu lực."
                    : "Vé không còn hiệu lực."}
            </p>
          )}
        </div>

        <div className="space-y-3 p-6">
          <Row label="Trạng thái">
            <Badge tone={TICKET_STATUS_TONE[ticket.status]}>{TICKET_STATUS_LABEL[ticket.status]}</Badge>
          </Row>
          <Row label="Phát hành">{formatDateTime(ticket.createdAt)}</Row>
          {ticket.checkedInAt && <Row label="Check-in lúc">{formatDateTime(ticket.checkedInAt)}</Row>}
        </div>

        {ticket.onlineUrl && (
          <div className="border-t border-ink-100 p-6">
            <p className="label">Link tham gia sự kiện trực tuyến</p>
            <a href={ticket.onlineUrl} target="_blank" rel="noreferrer" className="btn-primary mt-1 inline-flex">
              Tham gia sự kiện ↗
            </a>
            <p className="mt-2 text-xs text-ink-500">Link chỉ dành cho người có vé — vui lòng không chia sẻ.</p>
          </div>
        )}

        <ResellBox ticket={ticket} />
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="font-semibold text-ink-800">{children}</span>
    </div>
  );
}
