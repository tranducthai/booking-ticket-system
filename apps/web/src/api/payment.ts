import { api } from "./client";
import type { Paginated, Payment, Refund, RefundStatus } from "./types";

export const paymentApi = {
  create: (orderId: string, method: string) =>
    api.post<{ paymentId: string; redirectUrl: string }>("/payment/payments", { orderId, method }).then((r) => r.data),

  get: (paymentId: string) => api.get<Payment>(`/payment/payments/${paymentId}`).then((r) => r.data),

  refunds: {
    request: (orderId: string, reason: string) =>
      api.post<Refund>("/payment/refunds", { orderId, reason }).then((r) => r.data),
    list: (params: { eventId?: string; status?: RefundStatus; page?: number; limit?: number } = {}) =>
      api.get<Paginated<Refund>>("/payment/refunds", { params }).then((r) => r.data),
    approve: (id: string) => api.patch<Refund>(`/payment/refunds/${id}/approve`).then((r) => r.data),
    reject: (id: string) => api.patch<Refund>(`/payment/refunds/${id}/reject`).then((r) => r.data),
  },
};

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  REQUESTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  COMPLETED: "Đã hoàn tiền",
};
