import { RefundQueue } from "../../components/refunds/RefundQueue";

/** Admin sees every event's refunds; escalations and gateway failures land only here. */
export function AdminRefundsPage() {
  return (
    <div>
      <h2 className="text-lg font-bold text-ink-800">Yêu cầu hoàn tiền</h2>
      <p className="mt-1 text-sm text-ink-500">Khiếu nại từ khách (sau khi ban tổ chức từ chối hoặc quá hạn) và các giao dịch hoàn lỗi chỉ quản trị viên xử lý.</p>
      <div className="mt-4">
        <RefundQueue isAdmin />
      </div>
    </div>
  );
}
