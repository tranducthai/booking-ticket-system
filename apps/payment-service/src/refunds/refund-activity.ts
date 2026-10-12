import { vnd } from "../activity-log/format";
import { Refund } from "../generated/prisma";

// Separate module (not refunds.service.ts): RefundProcessorService needs it
// too, and refunds.service.ts already imports the processor — a cycle there
// would break Nest's constructor-type metadata.
/** RefundAuditLog action -> activity action + Vietnamese summary (docs/spec/14-activity-log-design.md §2). */
const REFUND_ACTIVITY: Record<string, { action: string; verb: string }> = {
  REQUEST: { action: "refund.requested", verb: "Yêu cầu hoàn" },
  APPROVE: { action: "refund.approved", verb: "Duyệt hoàn" },
  REJECT: { action: "refund.rejected", verb: "Từ chối hoàn" },
  NEED_INFO: { action: "refund.info_requested", verb: "Yêu cầu bổ sung cho yêu cầu hoàn" },
  RESPOND: { action: "refund.responded", verb: "Bổ sung thông tin yêu cầu hoàn" },
  ESCALATE: { action: "refund.escalated", verb: "Khiếu nại lên quản trị viên về yêu cầu hoàn" },
  WITHDRAW: { action: "refund.withdrawn", verb: "Rút yêu cầu hoàn" },
  SUPERSEDE: { action: "refund.superseded", verb: "Thay yêu cầu hoàn bằng hoàn do hủy sự kiện" },
  RETRY: { action: "refund.retried", verb: "Thử hoàn lại" },
  COMPLETE: { action: "refund.completed", verb: "Đã chuyển tiền hoàn" },
  FAIL: { action: "refund.failed", verb: "Cổng thanh toán từ chối hoàn" },
};

export function refundActivity(refund: Refund, actorId: string, auditAction: string, note: string | null) {
  const mapped = REFUND_ACTIVITY[auditAction] ?? { action: `refund.${auditAction.toLowerCase()}`, verb: auditAction };
  return {
    actorId,
    action: mapped.action,
    targetType: "refund",
    targetId: refund.id,
    eventId: refund.eventId,
    subjectUserId: refund.userId ?? refund.requestedBy,
    summary: `${mapped.verb} ${vnd(refund.amount)} (${refund.refundPercent}%) — đơn #${refund.orderId.slice(0, 8)}${note ? `: ${note}` : ""}`,
    metadata: { orderId: refund.orderId, kind: refund.kind, status: refund.status },
  };
}
