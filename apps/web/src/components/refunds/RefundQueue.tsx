import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { paymentApi } from "../../api/payment";
import type { RefundStatus } from "../../api/types";
import { EmptyState } from "../ui/EmptyState";
import { PageSpinner } from "../ui/Spinner";
import { RefundReviewCard } from "./RefundReviewCard";

const FILTERS: Array<{ label: string; status?: RefundStatus }> = [
  { label: "Chờ duyệt", status: "REQUESTED" },
  { label: "Cần bổ sung", status: "NEED_INFO" },
  { label: "Khiếu nại", status: "ESCALATED" },
  { label: "Chờ chuyển khoản", status: "APPROVED" },
  { label: "Lỗi hoàn tiền", status: "FAILED" },
  { label: "Đã hoàn", status: "COMPLETED" },
  { label: "Tất cả" },
];

/** Admin (all events, or one) and organizer (one of their events — eventId required) refund queue. */
export function RefundQueue({ eventId, isAdmin }: { eventId?: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const filters = isAdmin ? FILTERS : FILTERS.filter((f) => f.status !== "FAILED" && f.status !== "APPROVED");
  const [filter, setFilter] = useState(filters[0]);
  const queryKey = ["refunds", eventId ?? "all", filter.status ?? "all"];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => paymentApi.refunds.list({ eventId, status: filter.status, limit: 100 }),
  });

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.label}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${f === filter ? "bg-ink-800 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : data?.data.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Không có yêu cầu hoàn tiền nào" />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {data?.data.map((refund) => (
            <RefundReviewCard key={refund.id} refund={refund} isAdmin={isAdmin} onChanged={() => qc.invalidateQueries({ queryKey: ["refunds"] })} />
          ))}
        </div>
      )}
    </div>
  );
}
