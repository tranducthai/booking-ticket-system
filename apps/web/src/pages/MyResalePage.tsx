import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { apiErrorMessage } from "../api/client";
import { RESALE_STATUS_LABEL, resaleApi } from "../api/resale";
import type { ResaleListing } from "../api/types";
import { AccountLayout } from "../components/account/AccountLayout";
import { useResaleContext } from "../components/resale/ResaleListingCard";
import { Badge } from "../components/ui/Badge";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTime, formatVnd } from "../lib/format";

const TONE: Record<ResaleListing["status"], "success" | "warning" | "neutral" | "brand"> = {
  ACTIVE: "brand",
  RESERVED: "warning",
  SOLD: "success",
  CANCELED: "neutral",
};

/** "Vé đang bán lại" — the seller's listings, what each will pay out, and withdrawing an unsold one. */
export function MyResalePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["resale", "mine"], queryFn: resaleApi.mine });
  const ctx = useResaleContext(data ?? []);
  const [error, setError] = useState<string | null>(null);
  const cancel = useMutation({
    mutationFn: (id: string) => resaleApi.cancel(id),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["resale"] });
      void qc.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể huỷ tin bán.")),
  });

  return (
    <AccountLayout title="Vé đang bán lại" crumbs={[{ label: "Đơn hàng của tôi", to: "/don-hang" }, { label: "Vé đang bán lại" }]}>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {isLoading ? (
        <PageSpinner />
      ) : !data || data.length === 0 ? (
        <div className="py-8 text-center text-sm text-ink-500">
          Bạn chưa rao bán vé nào. Mở một vé trong{" "}
          <Link to="/ve-cua-toi" className="font-semibold text-brand-600 hover:underline">
            Vé của tôi
          </Link>{" "}
          và chọn "Bán lại vé".
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((l) => {
            const event = ctx.event(l);
            return (
              <div key={l.id} className="card flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink-400">{l.code}</span>
                    <Badge tone={TONE[l.status]}>{RESALE_STATUS_LABEL[l.status]}</Badge>
                  </div>
                  <Link to={`/su-kien/${l.eventId}`} className="mt-1 block font-bold text-ink-900 hover:text-brand-600">
                    {event?.title ?? "Sự kiện"}
                  </Link>
                  <p className="text-sm text-ink-500">
                    {ctx.zoneLabel(l)}
                    {event && ` · ${formatDateTime(event.startTime)}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-ink-500">
                    Giá bán <strong className="text-ink-900">{formatVnd(l.price)}</strong>
                  </p>
                  <p className="text-xs text-ink-500">
                    {l.status === "SOLD" ? "Bạn nhận" : "Sẽ nhận"} <strong className="text-emerald-700">{formatVnd(l.payoutAmount ?? 0)}</strong> (sau phí {formatVnd(l.feeAmount ?? 0)})
                  </p>
                  {l.status === "SOLD" && l.soldAt && <p className="text-xs text-ink-400">Bán lúc {formatDateTime(l.soldAt)} — tiền chuyển trong 3–5 ngày làm việc</p>}
                  {l.status === "ACTIVE" && (
                    <button
                      onClick={() => window.confirm(`Huỷ tin bán ${l.code}? Vé sẽ dùng lại được bình thường.`) && cancel.mutate(l.id)}
                      disabled={cancel.isPending}
                      className="mt-2 text-sm font-semibold text-ink-500 hover:text-red-600"
                    >
                      Huỷ tin bán
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AccountLayout>
  );
}
