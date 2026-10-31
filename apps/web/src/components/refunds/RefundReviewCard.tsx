import { useMutation } from "@tanstack/react-query";
import { check, rules } from "../../lib/validation";
import { useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { paymentApi } from "../../api/payment";
import type { Refund } from "../../api/types";
import { formatDateTime, formatVnd } from "../../lib/format";
import { EvidenceList, RefundSummary, RefundTimeline } from "./RefundParts";

type Mode = null | "approve" | "reject" | "need-info";

/**
 * One refund in a reviewer's queue (docs/spec/13-refund-and-anti-fraud-design.md §2.2).
 * Organizers act on REQUESTED/NEED_INFO of their own events; ESCALATED and
 * FAILED are admin-only — the backend enforces both, this just hides
 * buttons that would 4xx.
 */
export function RefundReviewCard({ refund, isAdmin, onChanged }: { refund: Refund; isAdmin: boolean; onChanged: () => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [message, setMessage] = useState("");
  const [percent, setPercent] = useState(refund.refundPercent);
  const [error, setError] = useState<string | null>(null);

  const reviewable =
    refund.status === "REQUESTED" || refund.status === "NEED_INFO" || (isAdmin && refund.status === "ESCALATED");
  const waitingTransfer = refund.payment?.method === "sepay" && (refund.status === "APPROVED" || refund.status === "FAILED" || refund.status === "PROCESSING");
  const canRetry = isAdmin && !waitingTransfer && (refund.status === "FAILED" || refund.status === "PROCESSING");
  const overdue = refund.slaDueAt && new Date(refund.slaDueAt) < new Date() && refund.status === "REQUESTED";

  const action = useMutation({
    mutationFn: () => {
      if (mode === "approve") {
        check(
          !Number.isInteger(percent) || percent < 1 || percent > 100 ? "Tỷ lệ hoàn từ 1% đến 100%" : null,
          percent < refund.refundPercent ? `Không được hoàn thấp hơn mức chính sách (${refund.refundPercent}%)` : null,
          message.length > 2000 ? "Ghi chú tối đa 2000 ký tự" : null,
        );
        return paymentApi.refunds.approve(refund.id, { percent, note: message || undefined });
      }
      check(rules.length(message, mode === "reject" ? "Lý do từ chối" : "Nội dung cần bổ sung", 5, 2000));
      if (mode === "reject") return paymentApi.refunds.reject(refund.id, message);
      return paymentApi.refunds.needInfo(refund.id, message);
    },
    onSuccess: () => {
      setMode(null);
      setMessage("");
      onChanged();
    },
    onError: (err) => setError(apiErrorMessage(err, "Thao tác thất bại.")),
  });
  const transferred = useMutation({
    mutationFn: () => paymentApi.refunds.markTransferred(refund.id),
    onSuccess: onChanged,
    onError: (err) => setError(apiErrorMessage(err, "Không thể xác nhận.")),
  });
  const retry = useMutation({
    mutationFn: () => paymentApi.refunds.retry(refund.id),
    onSuccess: onChanged,
    onError: (err) => setError(apiErrorMessage(err, "Không thể thử lại.")),
  });

  return (
    <div className="card p-5">
      <RefundSummary refund={refund} />
      {refund.status === "ESCALATED" && refund.escalatedAt && (
        <p className="mt-2 text-xs font-semibold text-amber-700">Khách khiếu nại lên quản trị viên lúc {formatDateTime(refund.escalatedAt)}</p>
      )}
      {overdue && <p className="mt-2 text-xs font-semibold text-red-600">Quá hạn xử lý ({formatDateTime(refund.slaDueAt!)}) — khách có thể khiếu nại</p>}
      <EvidenceList refund={refund} />
      <RefundTimeline refund={refund} />

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {waitingTransfer && (
        <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>
            Thanh toán qua SePay (chuyển khoản) không hoàn tự động được. Hãy chuyển lại <strong>{formatVnd(refund.amount)}</strong> cho khách bằng tay, rồi bấm xác nhận.
          </p>
          {isAdmin ? (
            <button
              onClick={() => confirm("Xác nhận bạn đã chuyển khoản hoàn tiền cho khách? Đơn và vé sẽ bị hủy.") && transferred.mutate()}
              disabled={transferred.isPending}
              className="btn-primary mt-2"
            >
              Đã chuyển khoản hoàn tiền
            </button>
          ) : (
            <p className="mt-1 text-xs">Quản trị viên sẽ chuyển khoản và xác nhận.</p>
          )}
        </div>
      )}

      {(reviewable || canRetry) && (
        <div className="mt-3 border-t border-ink-100 pt-3">
          {mode === null ? (
            <div className="flex flex-wrap gap-2">
              {reviewable && (
                <>
                  <button onClick={() => setMode("approve")} className="btn-primary">
                    Duyệt & hoàn tiền
                  </button>
                  <button onClick={() => setMode("need-info")} className="btn-secondary">
                    Yêu cầu bổ sung
                  </button>
                  <button onClick={() => setMode("reject")} className="btn-secondary">
                    Từ chối
                  </button>
                </>
              )}
              {canRetry && (
                <button
                  onClick={() => {
                    if (
                      refund.status !== "PROCESSING" ||
                      confirm("Giao dịch đang ở trạng thái chưa rõ kết quả. Chỉ thử lại khi đã xác nhận với cổng thanh toán rằng tiền CHƯA được hoàn.")
                    )
                      retry.mutate();
                  }}
                  disabled={retry.isPending}
                  className="btn-secondary"
                >
                  Thử hoàn lại
                </button>
              )}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                action.mutate();
              }}
              className="space-y-3"
            >
              {mode === "approve" && (
                <div>
                  <label className="label">Tỷ lệ hoàn (%) — chỉ được tăng so với chính sách ({refund.refundPercent}%)</label>
                  <input
                    type="number"
                    min={refund.refundPercent}
                    max={100}
                    value={percent}
                    onChange={(e) => setPercent(Number(e.target.value))}
                    className="input w-32"
                  />
                </div>
              )}
              <div>
                <label className="label">
                  {mode === "approve" ? "Ghi chú (không bắt buộc)" : mode === "reject" ? "Lý do từ chối (khách sẽ thấy)" : "Cần khách bổ sung gì?"}
                </label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="input min-h-[70px]" required={mode !== "approve"} />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={action.isPending || (mode !== "approve" && !message.trim())} className="btn-primary">
                  {action.isPending ? "Đang xử lý..." : "Xác nhận"}
                </button>
                <button type="button" onClick={() => setMode(null)} className="btn-ghost">
                  Hủy
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
