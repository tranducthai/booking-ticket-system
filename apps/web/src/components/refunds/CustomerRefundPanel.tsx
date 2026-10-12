import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { paymentApi, REFUND_REASON_LABEL } from "../../api/payment";
import type { EventItem, Order, Refund, RefundReasonCategory } from "../../api/types";
import { formatDateTime, formatVnd } from "../../lib/format";
import { EvidenceList, EvidencePicker, RefundSummary, RefundTimeline } from "./RefundParts";

const ESCALATION_WINDOW_MS = 7 * 24 * 3_600_000; // mirrors refunds.service.ts

/**
 * Customer side of docs/spec/13-refund-and-anti-fraud-design.md §2.2: the
 * policy + live quote up front, then a request form (reason category,
 * description, evidence), then the request's own lifecycle (respond to
 * NEED_INFO, withdraw, escalate).
 */
export function CustomerRefundPanel({ order, event }: { order: Order; event?: EventItem }) {
  const qc = useQueryClient();
  const { data: refunds = [] } = useQuery({ queryKey: ["refunds", "mine", order.id], queryFn: () => paymentApi.refunds.mine(order.id) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["refunds", "mine", order.id] });
    void qc.invalidateQueries({ queryKey: ["order", order.id] });
  };

  const active = refunds.find((r) => !["REJECTED_FINAL", "WITHDRAWN"].includes(r.status) && !(r.status === "REJECTED" && !canEscalate(r)));
  const history = refunds.filter((r) => r !== active);

  return (
    <div className="card mt-4 p-6">
      <h2 className="text-base font-bold text-ink-800">Hoàn vé</h2>
      {event && <PolicySummary event={event} />}

      {active ? (
        <div className="mt-4">
          <ActiveRefund refund={active} onChanged={refresh} />
        </div>
      ) : event?.status === "CANCELED" ? (
        <p className="mt-3 text-sm text-ink-600">Sự kiện đã bị hủy — vé được hoàn 100% tự động, bạn không cần gửi yêu cầu.</p>
      ) : order.status === "TICKET_ISSUED" ? (
        <RequestForm order={order} onCreated={refresh} />
      ) : (
        <p className="mt-3 text-sm text-ink-500">Chỉ có thể yêu cầu hoàn cho đơn đã phát hành vé.</p>
      )}

      {history.length > 0 && (
        <div className="mt-5 space-y-3 border-t border-ink-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Yêu cầu trước đây</p>
          {history.map((r) => (
            <div key={r.id} className="rounded-xl bg-ink-50 p-4">
              <RefundSummary refund={r} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function canEscalate(refund: Refund): boolean {
  if (refund.escalatedAt) return false;
  if (refund.status === "REJECTED") return !!refund.decidedAt && Date.now() - new Date(refund.decidedAt).getTime() <= ESCALATION_WINDOW_MS;
  if (refund.status === "REQUESTED" || refund.status === "NEED_INFO") return !!refund.slaDueAt && new Date(refund.slaDueAt) < new Date();
  return false;
}

function PolicySummary({ event }: { event: EventItem }) {
  if (event.postponedAt && event.refundWindowEndsAt && new Date(event.refundWindowEndsAt) > new Date()) {
    return (
      <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
        Sự kiện đã đổi lịch — bạn được hoàn 100% nếu yêu cầu trước {formatDateTime(event.refundWindowEndsAt)}.
      </p>
    );
  }
  const policy = event.refundPolicy;
  if (!policy?.customerRefundable) {
    return <p className="mt-2 text-sm text-ink-500">Sự kiện này không hỗ trợ hoàn vé theo yêu cầu (trừ khi sự kiện bị hủy hoặc đổi lịch).</p>;
  }
  const tiers = [...policy.tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore);
  return (
    <ul className="mt-2 space-y-0.5 text-sm text-ink-600">
      {tiers.map((t) => (
        <li key={t.minHoursBefore}>
          • Trước giờ diễn ≥ {t.minHoursBefore >= 24 ? `${t.minHoursBefore / 24} ngày` : `${t.minHoursBefore} giờ`}: hoàn {t.percent}%
        </li>
      ))}
    </ul>
  );
}

function RequestForm({ order, onCreated }: { order: Order; onCreated: () => void }) {
  const [category, setCategory] = useState<RefundReasonCategory>("PERSONAL");
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: quote } = useQuery({
    queryKey: ["refund-quote", order.id, category],
    queryFn: () => paymentApi.refunds.quote(order.id, category),
    retry: false,
  });

  const submit = useMutation({
    mutationFn: () => paymentApi.refunds.request({ orderId: order.id, reasonCategory: category, reason, files }),
    onSuccess: onCreated,
    onError: (err) => setError(apiErrorMessage(err, "Không thể gửi yêu cầu hoàn tiền.")),
  });

  if (quote && !quote.eligible) {
    return <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">{quote.message}</p>;
  }

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        submit.mutate();
      }}
    >
      {quote?.eligible && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Nếu được duyệt, bạn nhận lại <strong>{formatVnd(quote.amount)}</strong> ({quote.percent}% của {formatVnd(quote.grossAmount)})
          {quote.autoApprove && " — hoàn ngay, không cần chờ duyệt"}.
        </div>
      )}
      <div>
        <label className="label">Lý do</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as RefundReasonCategory)} className="input">
          {Object.entries(REFUND_REASON_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Mô tả</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Trình bày lý do hoàn vé..." className="input min-h-[80px]" />
      </div>
      <div>
        <label className="label">Minh chứng {quote?.eligible && quote.evidenceRequired ? "(bắt buộc)" : "(không bắt buộc)"}</label>
        <EvidencePicker files={files} onChange={setFiles} />
      </div>
      <p className="text-xs text-ink-500">Trong thời gian chờ xử lý, vé của đơn này sẽ tạm khóa và không thể check-in.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={!reason.trim() || submit.isPending || !quote?.eligible || (quote.evidenceRequired && files.length === 0)}
        className="btn-primary"
      >
        {submit.isPending ? "Đang gửi..." : "Gửi yêu cầu hoàn vé"}
      </button>
    </form>
  );
}

function ActiveRefund({ refund, onChanged }: { refund: Refund; onChanged: () => void }) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<null | "respond" | "escalate">(refund.status === "NEED_INFO" ? "respond" : null);
  const [error, setError] = useState<string | null>(null);
  const onError = (err: unknown) => setError(apiErrorMessage(err, "Thao tác thất bại."));
  const done = () => {
    setMessage("");
    setFiles([]);
    setMode(null);
    onChanged();
  };

  const respond = useMutation({ mutationFn: () => paymentApi.refunds.respond(refund.id, { message: message || undefined, files }), onSuccess: done, onError });
  const escalate = useMutation({ mutationFn: () => paymentApi.refunds.escalate(refund.id, message), onSuccess: done, onError });
  const withdraw = useMutation({ mutationFn: () => paymentApi.refunds.withdraw(refund.id), onSuccess: done, onError });

  const open = ["REQUESTED", "NEED_INFO", "ESCALATED"].includes(refund.status);

  return (
    <div className="rounded-xl ring-1 ring-ink-100 p-4">
      <RefundSummary refund={refund} />
      <EvidenceList refund={refund} />
      <RefundTimeline refund={refund} />

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {mode === "respond" && (
        <div className="mt-3 space-y-2 border-t border-ink-100 pt-3">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Phản hồi / giải thích thêm..." className="input min-h-[70px]" />
          <EvidencePicker files={files} onChange={setFiles} />
          <button onClick={() => respond.mutate()} disabled={respond.isPending || (!message.trim() && files.length === 0)} className="btn-primary">
            Gửi bổ sung
          </button>
        </div>
      )}

      {mode === "escalate" && (
        <div className="mt-3 space-y-2 border-t border-ink-100 pt-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Vì sao bạn cho rằng yêu cầu nên được chấp nhận?"
            className="input min-h-[70px]"
          />
          <button onClick={() => escalate.mutate()} disabled={escalate.isPending || !message.trim()} className="btn-primary">
            Gửi khiếu nại
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {open && mode !== "respond" && (
          <button onClick={() => setMode("respond")} className="btn-secondary">
            Bổ sung minh chứng
          </button>
        )}
        {canEscalate(refund) && mode !== "escalate" && (
          <button onClick={() => setMode("escalate")} className="btn-secondary">
            Khiếu nại lên quản trị viên
          </button>
        )}
        {open && (
          <button
            onClick={() => {
              if (confirm("Rút yêu cầu hoàn? Vé sẽ được mở khóa để bạn tham dự.")) withdraw.mutate();
            }}
            disabled={withdraw.isPending}
            className="btn-ghost"
          >
            Rút yêu cầu
          </button>
        )}
      </div>
    </div>
  );
}
