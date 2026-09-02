import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Link, useParams } from "react-router-dom";
import { ticketsApi } from "../api/tickets";
import { Badge } from "../components/ui/Badge";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTime } from "../lib/format";

export function TicketDetailPage() {
  const { id = "" } = useParams();
  const { data: ticket, isLoading } = useQuery({ queryKey: ["ticket", id], queryFn: () => ticketsApi.get(id) });

  if (isLoading || !ticket) return <PageSpinner />;

  return (
    <div className="container-page max-w-md py-10">
      <Link to="/ve-cua-toi" className="text-sm font-semibold text-ink-500 hover:text-ink-700">
        ← Vé của tôi
      </Link>

      <div className="card mt-4 overflow-hidden">
        <div className="bg-gradient-to-br from-ink-800 to-ink-900 px-6 py-5 text-white">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-300">Vé điện tử</p>
          <p className="mt-1 font-mono text-xs text-ink-300">#{ticket.id}</p>
        </div>

        <div className="flex flex-col items-center border-b border-dashed border-ink-200 p-8">
          <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100">
            <QRCodeSVG value={ticket.qrPayload} size={200} />
          </div>
          <p className="mt-4 text-center text-xs text-ink-400">
            Xuất trình mã này tại cổng soát vé. Mỗi mã chỉ quét được một lần.
          </p>
        </div>

        <div className="space-y-3 p-6">
          <Row label="Trạng thái">
            <Badge tone={ticket.status === "ISSUED" ? "success" : ticket.status === "USED" ? "neutral" : "danger"}>
              {ticket.status === "ISSUED" ? "Có thể sử dụng" : ticket.status === "USED" ? "Đã sử dụng" : "Đã hủy"}
            </Badge>
          </Row>
          <Row label="Phát hành">{formatDateTime(ticket.createdAt)}</Row>
          {ticket.checkedInAt && <Row label="Check-in lúc">{formatDateTime(ticket.checkedInAt)}</Row>}
        </div>
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
