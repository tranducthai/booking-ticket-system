import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ticketsApi } from "../api/tickets";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTime } from "../lib/format";
import type { TicketStatus } from "../api/types";

const STATUS_LABEL: Record<TicketStatus, string> = { ISSUED: "Có thể sử dụng", USED: "Đã sử dụng", CANCELED: "Đã hủy" };
const STATUS_TONE: Record<TicketStatus, "success" | "neutral" | "danger"> = {
  ISSUED: "success",
  USED: "neutral",
  CANCELED: "danger",
};

export function TicketsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["tickets", "mine"], queryFn: () => ticketsApi.mine({ limit: 50 }) });

  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="text-2xl">Vé của tôi</h1>

      {isLoading ? (
        <PageSpinner />
      ) : data?.data.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Bạn chưa có vé nào" description="Vé điện tử sẽ xuất hiện ở đây ngay sau khi thanh toán thành công." />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {data?.data.map((ticket) => (
            <Link key={ticket.id} to={`/ve-cua-toi/${ticket.id}`} className="card overflow-hidden hover:shadow-lg">
              <div className="flex items-center justify-between bg-ink-900 px-5 py-3 text-white">
                <span className="text-xs font-bold uppercase tracking-wide text-brand-300">E-Ticket</span>
                <Badge tone={STATUS_TONE[ticket.status]}>{STATUS_LABEL[ticket.status]}</Badge>
              </div>
              <div className="p-5">
                <p className="font-mono text-xs text-ink-400">#{ticket.id.slice(0, 8)}</p>
                <p className="mt-2 text-sm text-ink-500">Phát hành {formatDateTime(ticket.createdAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
