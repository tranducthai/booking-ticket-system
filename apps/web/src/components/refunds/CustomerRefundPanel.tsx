import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { check, rules } from "../../lib/validation";
import { useMemo, useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { paymentApi, REFUND_REASON_LABEL } from "../../api/payment";
import { TICKET_STATUS_LABEL, ticketsApi } from "../../api/tickets";
import type { EventItem, Order, Refund, RefundReasonCategory, Ticket } from "../../api/types";
import { formatDateTime, formatVnd } from "../../lib/format";
import { claimedItemIds, orderItemLabel } from "../../lib/orderTickets";
import { RefundSummary, RefundTimeline } from "./RefundParts";

const ESCALATION_WINDOW_MS = 7 * 24 * 3_600_000; // mirrors refunds.service.ts
const OPEN_REFUND_STATUSES: Refund["status"][] = ["REQUESTED", "NEED_INFO", "ESCALATED", "APPROVED", "PROCESSING", "FAILED"];

/**
 * Customer side of docs/spec/13-refund-and-anti-fraud-design.md §2.2, per
 * ticket: pick which tickets of the order to cancel, see the live quote for
 * exactly those, then submit. An order can carry several refunds (one per
 * cancellation), each with its own lifecycle (respond to NEED_INFO,
 * withdraw, escalate). When the organizer enabled auto-approval the money
 * goes back right away and the tickets die at once.
 */
export function CustomerRefundPanel({ order, event }: { order: Order; event?: EventItem }) {
  const qc = useQueryClient();
  const { data: refunds = [] } = useQuery({ queryKey: ["refunds", "mine", order.id], queryFn: () => paymentApi.refunds.mine(order.id) });
  const { data: tickets } = useQuery({
    queryKey: ["tickets", "mine", "event", order.eventId],
    queryFn: () => ticketsApi.mine({ eventId: order.eventId ?? undefined, limit: 100 }),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["refunds", "mine", order.id] });
    void qc.invalidateQueries({ queryKey: ["order", order.id] });
    void qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  const active = refunds.filter((r) => OPEN_REFUND_STATUSES.includes(r.status) || (r.status === "REJECTED" && canEscalate(r)));
  const history = refunds.filter((r) => !active.includes(r));
  const ticketByItem = useMemo(() => new Map((tickets?.data ?? []).map((t) => [t.orderItemId, t])), [tickets]);

  return (
    <div className="card mt-4 p-6">
      <h2 className="text-base font-bold text-ink-800">Hủy vé & hoàn tiền</h2>
      {event && <PolicySummary event={event} />}

      {active.map((r) => (
        <div key={r.id} className="mt-4">
          <ActiveRefund refund={r} onChanged={refresh} />
        </div>
      ))}

      {event?.status === "CANCELED" ? (
        <p className="mt-3 text-sm text-ink-600">Sự kiện đã bị hủy — vé được hoàn 100% tự động, bạn không cần gửi yêu cầu.</p>
      ) : order.status === "TICKET_ISSUED" ? (
        tickets && <RequestForm order={order} event={event} refunds={refunds} ticketByItem={ticketByItem} onCreated={refresh} />
      ) : (
        order.status !== "CANCELED" && <p className="mt-3 text-sm text-ink-500">Chỉ có thể hủy vé của đơn đã phát hành vé.</p>
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
    <>
      <ul className="mt-2 space-y-0.5 text-sm text-ink-600">
        {tiers.map((t) => (
          <li key={t.minHoursBefore}>
            • Trước giờ diễn ≥ {t.minHoursBefore >= 24 ? `${t.minHoursBefore / 24} ngày` : `${t.minHoursBefore} giờ`}: hoàn {t.percent}%
          </li>
        ))}
      </ul>
      {policy.autoApprove && <p className="mt-1 text-xs font-semibold text-emerald-700">Hoàn tiền tự động — không cần chờ ban tổ chức duyệt.</p>}
    </>
  );
}

function RequestForm({
  order,
  event,
  refunds,
  ticketByItem,
  onCreated,
}: {
  order: Order;
  event?: EventItem;
  refunds: Refund[];
  ticketByItem: Map<string, Ticket>;
  onCreated: () => void;
}) {
  const claimed = claimedItemIds(
    refunds,
    order.items.map((i) => i.id),
  );
  // Cancelable = not refunded, not claimed by another refund, ticket still valid (a scanned ticket can't be refunded).
  const cancelable = order.items.filter((i) => !i.refundedAt && !claimed.has(i.id) && ticketByItem.get(i.id)?.status === "ISSUED");

  const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState<RefundReasonCategory>("PERSONAL");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chosen = selected.filter((id) => cancelable.some((i) => i.id === id));

  const { data: quote } = useQuery({
    queryKey: ["refund-quote", order.id, category, chosen],
    queryFn: () => paymentApi.refunds.quote(order.id, category, chosen),
    enabled: chosen.length > 0,
    retry: false,
  });

  const submit = useMutation({
    mutationFn: () => {
      check(rules.length(reason, "Mô tả lý do", 5, 2000));
      return paymentApi.refunds.request({ orderId: order.id, orderItemIds: chosen, reasonCategory: category, reason: reason.trim() });
    },
    onSuccess: () => {
      setSelected([]);
      setReason("");
      onCreated();
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể gửi yêu cầu hủy vé.")),
  });

  if (cancelable.length === 0) {
    return <p className="mt-4 text-sm text-ink-500">Không còn vé nào có thể hủy trong đơn này.</p>;
  }

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const instant = quote?.eligible && quote.autoApprove;

  return (
    <form
      className="mt-4 space-y-3 border-t border-ink-100 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (instant && !confirm(`Hủy ${chosen.length} vé? Vé sẽ bị vô hiệu hóa ngay và tiền được hoàn tự động — không thể hoàn tác.`)) return;
        submit.mutate();
      }}
    >
      <div>
        <div className="flex items-center justify-between">
          <label className="label">Chọn vé muốn hủy</label>
          <button
            type="button"
            className="mb-1.5 text-xs font-semibold text-brand-600 hover:underline"
            onClick={() => setSelected(chosen.length === cancelable.length ? [] : cancelable.map((i) => i.id))}
          >
            {chosen.length === cancelable.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
          </button>
        </div>
        <div className="space-y-1.5">
          {order.items.map((item, index) => {
            const ticket = ticketByItem.get(item.id);
            const isCancelable = cancelable.includes(item);
            return (
              <label
                key={item.id}
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ring-1 ring-ink-100 ${isCancelable ? "cursor-pointer hover:bg-ink-50" : "opacity-60"}`}
              >
                <span className="flex items-center gap-2">
                  <input type="checkbox" disabled={!isCancelable} checked={chosen.includes(item.id)} onChange={() => toggle(item.id)} />
                  {orderItemLabel(item, event, index)}
                  {item.quantity > 1 && <span className="text-xs text-ink-400">(×{item.quantity})</span>}
                </span>
                <span className="text-xs text-ink-500">
                  {item.refundedAt ? "Đã hoàn" : claimed.has(item.id) ? "Đang chờ hoàn" : ticket ? TICKET_STATUS_LABEL[ticket.status] : ""}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {chosen.length > 0 && quote && !quote.eligible && (
        <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">{quote.message}</p>
      )}
      {quote?.eligible && chosen.length > 0 && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {instant ? "Bạn nhận lại ngay" : "Nếu được duyệt, bạn nhận lại"} <strong>{formatVnd(quote.amount)}</strong> ({quote.percent}% của{" "}
          {formatVnd(quote.grossAmount)} cho {chosen.length} vé){!instant && " — ban tổ chức sẽ xem xét yêu cầu"}.
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
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Trình bày lý do hủy vé..." className="input min-h-[80px]" />
      </div>
      {!instant && <p className="text-xs text-ink-500">Trong thời gian chờ xử lý, các vé đã chọn sẽ tạm khóa và không thể check-in. Vé khác trong đơn vẫn dùng bình thường.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={chosen.length === 0 || !reason.trim() || submit.isPending || !quote?.eligible}
        className="btn-primary"
      >
        {submit.isPending ? "Đang gửi..." : instant ? `Hủy ${chosen.length || ""} vé & hoàn tiền` : `Gửi yêu cầu hủy ${chosen.length || ""} vé`}
      </button>
    </form>
  );
}

function ActiveRefund({ refund, onChanged }: { refund: Refund; onChanged: () => void }) {
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<null | "respond" | "escalate">(refund.status === "NEED_INFO" ? "respond" : null);
  const [error, setError] = useState<string | null>(null);
  const onError = (err: unknown) => setError(apiErrorMessage(err, "Thao tác thất bại."));
  const done = () => {
    setMessage("");
    setMode(null);
    onChanged();
  };

  const respond = useMutation({ mutationFn: () => paymentApi.refunds.respond(refund.id, { message: message.trim() }), onSuccess: done, onError });
  const escalate = useMutation({ mutationFn: () => paymentApi.refunds.escalate(refund.id, message), onSuccess: done, onError });
  const withdraw = useMutation({ mutationFn: () => paymentApi.refunds.withdraw(refund.id), onSuccess: done, onError });

  const open = ["REQUESTED", "NEED_INFO", "ESCALATED"].includes(refund.status);

  return (
    <div className="rounded-xl ring-1 ring-ink-100 p-4">
      <RefundSummary refund={refund} />
      <RefundTimeline refund={refund} />

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {mode === "respond" && (
        <div className="mt-3 space-y-2 border-t border-ink-100 pt-3">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Phản hồi / giải thích thêm..." className="input min-h-[70px]" />
          <button onClick={() => respond.mutate()} disabled={respond.isPending || !message.trim()} className="btn-primary">
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
            Bổ sung thông tin
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
