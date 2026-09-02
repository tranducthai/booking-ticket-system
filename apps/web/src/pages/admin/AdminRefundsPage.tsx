import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { paymentApi, REFUND_STATUS_LABEL } from "../../api/payment";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime, formatVnd } from "../../lib/format";

export function AdminRefundsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "refunds"], queryFn: () => paymentApi.refunds.list({ limit: 100 }) });

  const approveMutation = useMutation({
    mutationFn: (id: string) => paymentApi.refunds.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "refunds"] }),
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => paymentApi.refunds.reject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "refunds"] }),
  });

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <h2 className="text-lg font-bold text-ink-800">Yêu cầu hoàn tiền</h2>

      {data?.data.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Không có yêu cầu hoàn tiền nào" />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {data?.data.map((refund) => (
            <div key={refund.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-ink-400">Đơn #{refund.orderId.slice(0, 8)}</p>
                  <p className="mt-1 text-sm text-ink-700">{refund.reason}</p>
                  <p className="mt-1 text-xs text-ink-400">{formatDateTime(refund.createdAt)}</p>
                </div>
                <div className="text-right">
                  <Badge tone={refund.status === "COMPLETED" ? "success" : refund.status === "REJECTED" ? "danger" : "warning"}>
                    {REFUND_STATUS_LABEL[refund.status]}
                  </Badge>
                  <p className="mt-2 font-bold text-ink-900">{formatVnd(refund.amount)}</p>
                </div>
              </div>
              {refund.status === "REQUESTED" && (
                <div className="mt-3 flex gap-2 border-t border-ink-100 pt-3">
                  <button onClick={() => approveMutation.mutate(refund.id)} className="btn-primary">
                    Duyệt & hoàn tiền
                  </button>
                  <button onClick={() => rejectMutation.mutate(refund.id)} className="btn-secondary">
                    Từ chối
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
