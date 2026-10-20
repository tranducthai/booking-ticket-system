import { api } from "./client";
import type { Paginated, Payment, Refund, RefundKind, RefundQuote, RefundReasonCategory, RefundStatus } from "./types";

export const paymentApi = {
  create: (orderId: string, method: string) =>
    api.post<{ paymentId: string; redirectUrl: string }>("/payment/payments", { orderId, method }).then((r) => r.data),

  get: (paymentId: string) => api.get<Payment>(`/payment/payments/${paymentId}`).then((r) => r.data),

  /** docs/spec/13-refund-and-anti-fraud-design.md §2.2 — see apps/payment-service/src/refunds/refunds.controller.ts. */
  refunds: {
    /** orderItemIds = the tickets to cancel (comma-joined in the query); omitted = all remaining tickets of the order. */
    quote: (orderId: string, reasonCategory?: RefundReasonCategory, orderItemIds?: string[]) =>
      api
        .get<RefundQuote>("/payment/refunds/quote", { params: { orderId, reasonCategory, orderItemIds: orderItemIds?.join(",") || undefined } })
        .then((r) => r.data),

    /** Multipart so evidence files travel with the request. */
    request: (data: { orderId: string; orderItemIds: string[]; reasonCategory: RefundReasonCategory; reason: string; files: File[] }) => {
      const form = new FormData();
      form.append("orderId", data.orderId);
      form.append("orderItemIds", data.orderItemIds.join(","));
      form.append("reasonCategory", data.reasonCategory);
      form.append("reason", data.reason);
      data.files.forEach((f) => form.append("files", f));
      return api.post<Refund>("/payment/refunds", form).then((r) => r.data);
    },

    mine: (orderId?: string) => api.get<Refund[]>("/payment/refunds/mine", { params: { orderId } }).then((r) => r.data),

    list: (params: { eventId?: string; status?: RefundStatus; page?: number; limit?: number } = {}) =>
      api.get<Paginated<Refund>>("/payment/refunds", { params }).then((r) => r.data),

    /** Evidence is served only through the auth-checked API, so fetch it as a blob and open an object URL. */
    evidenceBlob: (refundId: string, evidenceId: string) =>
      api.get<Blob>(`/payment/refunds/${refundId}/evidence/${evidenceId}`, { responseType: "blob" }).then((r) => r.data),

    approve: (id: string, data: { percent?: number; note?: string } = {}) =>
      api.patch<Refund>(`/payment/refunds/${id}/approve`, data).then((r) => r.data),
    reject: (id: string, message: string) => api.patch<Refund>(`/payment/refunds/${id}/reject`, { message }).then((r) => r.data),
    needInfo: (id: string, message: string) => api.patch<Refund>(`/payment/refunds/${id}/need-info`, { message }).then((r) => r.data),
    retry: (id: string) => api.patch<Refund>(`/payment/refunds/${id}/retry`).then((r) => r.data),

    respond: (id: string, data: { message?: string; files: File[] }) => {
      const form = new FormData();
      if (data.message) form.append("message", data.message);
      data.files.forEach((f) => form.append("files", f));
      return api.post<Refund>(`/payment/refunds/${id}/respond`, form).then((r) => r.data);
    },
    withdraw: (id: string) => api.post<Refund>(`/payment/refunds/${id}/withdraw`).then((r) => r.data),
    escalate: (id: string, message: string) => api.post<Refund>(`/payment/refunds/${id}/escalate`, { message }).then((r) => r.data),
  },
};

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  REQUESTED: "Chờ duyệt",
  NEED_INFO: "Cần bổ sung",
  APPROVED: "Đã duyệt",
  PROCESSING: "Đang hoàn tiền",
  COMPLETED: "Đã hoàn tiền",
  FAILED: "Hoàn tiền lỗi",
  REJECTED: "Từ chối",
  ESCALATED: "Đang khiếu nại",
  REJECTED_FINAL: "Từ chối (cuối)",
  WITHDRAWN: "Đã rút",
};

export const REFUND_STATUS_TONE: Record<RefundStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  REQUESTED: "warning",
  NEED_INFO: "warning",
  APPROVED: "brand",
  PROCESSING: "brand",
  COMPLETED: "success",
  FAILED: "danger",
  REJECTED: "danger",
  ESCALATED: "warning",
  REJECTED_FINAL: "danger",
  WITHDRAWN: "neutral",
};

export const REFUND_KIND_LABEL: Record<RefundKind, string> = {
  CUSTOMER_REQUEST: "Khách yêu cầu",
  EVENT_CANCELED: "Sự kiện bị hủy",
  EVENT_POSTPONED: "Sự kiện đổi lịch",
  SYSTEM_ERROR: "Lỗi hệ thống",
};

export const REFUND_REASON_LABEL: Record<RefundReasonCategory, string> = {
  PERSONAL: "Lý do cá nhân",
  SCHEDULE_CONFLICT: "Trùng lịch",
  MEDICAL: "Sức khỏe / y tế",
  EVENT_ISSUE: "Sự kiện không đúng mô tả",
  OTHER: "Khác",
};

export const REFUND_ACTION_LABEL: Record<string, string> = {
  REQUEST: "Gửi yêu cầu",
  APPROVE: "Duyệt",
  REJECT: "Từ chối",
  NEED_INFO: "Yêu cầu bổ sung",
  RESPOND: "Bổ sung thông tin",
  ESCALATE: "Khiếu nại lên quản trị viên",
  WITHDRAW: "Rút yêu cầu",
  SUPERSEDE: "Thay bằng hoàn do hủy sự kiện",
  COMPLETE: "Đã chuyển tiền",
  FAIL: "Cổng thanh toán từ chối",
  RETRY: "Thử hoàn lại",
};

/** Mirrors evidence-storage.service.ts limits. */
export const EVIDENCE_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
export const MAX_EVIDENCE_FILES = 5;
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
