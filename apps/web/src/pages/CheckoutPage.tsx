import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiErrorMessage } from "../api/client";
import { bookingApi, ORDER_STATUS_LABEL } from "../api/booking";
import { eventsApi } from "../api/events";
import { paymentApi } from "../api/payment";
import { Badge } from "../components/ui/Badge";
import { PageSpinner } from "../components/ui/Spinner";
import { formatVnd, timeLeft } from "../lib/format";

// Ids match GATEWAY_METHODS in payment-service (src/gateway/payment-gateway.interface.ts) exactly.
const METHODS = [
  { id: "vnpay", label: "VNPay" },
  { id: "momo", label: "MoMo" },
  { id: "paypal", label: "PayPal" },
  { id: "sepay", label: "Chuyển khoản (VietQR)" },
];

export function CheckoutPage() {
  const { orderId = "" } = useParams();
  const [search] = useSearchParams();
  const returning = search.get("ket-qua"); // set by payment-service's mock redirect (or a real gateway's return URL)
  const transferPaymentId = search.get("chuyen-khoan"); // set by payment-service's SePay gateway — show the QR instead of redirecting out
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => bookingApi.getOrder(orderId),
    refetchInterval: (q) => (returning && q.state.data?.status === "PENDING_PAYMENT" ? 1500 : false),
  });

  const { data: event } = useQuery({
    queryKey: ["event", order?.eventId],
    queryFn: () => eventsApi.getById(order!.eventId),
    enabled: !!order,
  });

  const [code, setCode] = useState("");
  const [method, setMethod] = useState("vnpay");
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const discountMutation = useMutation({
    mutationFn: () => bookingApi.applyDiscount(orderId, code),
    onSuccess: (updated) => qc.setQueryData(["order", orderId], updated),
    onError: (err) => setError(apiErrorMessage(err, "Mã giảm giá không hợp lệ.")),
  });

  const payMutation = useMutation({
    mutationFn: () => paymentApi.create(orderId, method),
    onSuccess: (res) => {
      window.location.href = res.redirectUrl;
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể khởi tạo thanh toán.")),
  });

  const cancelMutation = useMutation({
    mutationFn: () => bookingApi.cancel(orderId),
    onSuccess: () => navigate("/don-hang"),
  });

  if (isLoading || !order) return <PageSpinner />;

  if (returning) {
    if (order.status === "PENDING_PAYMENT") {
      return (
        <Result title="Đang xác nhận thanh toán..." spinner>
          Chỉ mất vài giây — trang sẽ tự cập nhật.
        </Result>
      );
    }
    if (order.status === "PAID" || order.status === "TICKET_ISSUED") {
      return (
        <Result title="Thanh toán thành công 🎉" tone="success">
          Vé điện tử của bạn đang được tạo và sẽ có trong mục{" "}
          <Link to="/ve-cua-toi" className="font-semibold text-brand-600 underline">
            Vé của tôi
          </Link>{" "}
          trong giây lát. Chúng tôi cũng đã gửi email xác nhận.
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/ve-cua-toi" className="btn-primary">
              Xem vé của tôi
            </Link>
            <Link to={`/don-hang/${orderId}`} className="btn-secondary">
              Xem đơn hàng
            </Link>
          </div>
        </Result>
      );
    }
    return (
      <Result title="Thanh toán không thành công" tone="danger">
        Đơn hàng của bạn chưa được thanh toán. Chỗ giữ đã được nhả lại nếu hết hạn.
        <div className="mt-6 flex justify-center gap-3">
          <Link to={event ? `/su-kien/${event.id}` : "/su-kien"} className="btn-primary">
            Thử lại
          </Link>
        </div>
      </Result>
    );
  }

  if (transferPaymentId && order.status === "PENDING_PAYMENT") {
    return <BankTransfer paymentId={transferPaymentId} expiresAt={order.expiresAt} onBack={() => navigate(`/thanh-toan/${orderId}`)} />;
  }

  if (order.status !== "PENDING_PAYMENT") {
    return (
      <Result title={ORDER_STATUS_LABEL[order.status]} tone={order.status === "PAID" ? "success" : "neutral"}>
        <Link to={`/don-hang/${orderId}`} className="btn-primary mt-4">
          Xem đơn hàng
        </Link>
      </Result>
    );
  }

  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="text-2xl">Thanh toán</h1>
      {order.expiresAt && (
        <p className="mt-1 text-sm text-brand-600">
          Giữ chỗ hết hạn sau <span className="font-mono font-bold">{timeLeft(order.expiresAt)}</span>
        </p>
      )}

      <div className="card mt-6 p-6">
        <h2 className="text-base font-bold text-ink-800">{event?.title ?? "Đơn hàng"}</h2>
        <div className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-sm">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span className="text-ink-600">
                {item.seatId ? "Ghế" : "Vé"} × {item.quantity}
              </span>
              <span className="font-semibold">{formatVnd(Number(item.price) * item.quantity)}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2 border-t border-ink-100 pt-4">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Mã giảm giá" className="input" />
          <button
            onClick={() => discountMutation.mutate()}
            disabled={!code || discountMutation.isPending}
            className="btn-secondary shrink-0"
          >
            Áp dụng
          </button>
        </div>
        {order.discountCode && (
          <p className="mt-2 text-sm text-emerald-600">
            Đã áp dụng mã <strong>{order.discountCode}</strong> · -{formatVnd(order.discountAmount)}
          </p>
        )}

        <div className="mt-4 space-y-1 border-t border-ink-100 pt-4 text-sm">
          <div className="flex justify-between text-ink-500">
            <span>Tạm tính</span>
            <span>{formatVnd(order.subtotal)}</span>
          </div>
          {Number(order.discountAmount) > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Giảm giá</span>
              <span>-{formatVnd(order.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 text-base font-extrabold text-ink-900">
            <span>Tổng cộng</span>
            <span className="text-brand-600">{formatVnd(order.totalAmount)}</span>
          </div>
        </div>
      </div>

      <div className="card mt-4 p-6">
        <p className="label">Phương thức thanh toán</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {METHODS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={`rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-colors ${
                method === m.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-100 text-ink-600 hover:border-ink-200"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-400">
          Demo: khi PAYMENT_GATEWAY_MODE=mock (mặc định), mọi phương thức đều đi qua cùng cổng thanh toán mô phỏng.
        </p>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex items-center justify-between">
        <button onClick={() => cancelMutation.mutate()} className="btn-ghost text-sm">
          Hủy giữ chỗ
        </button>
        <button onClick={() => payMutation.mutate()} disabled={payMutation.isPending} className="btn-primary px-8 py-3 text-base">
          {payMutation.isPending ? "Đang chuyển hướng..." : `Thanh toán ${formatVnd(order.totalAmount)}`}
        </button>
      </div>
    </div>
  );
}

/** Shows the VietQR and polls the payment until SePay's webhook marks it paid, then hands off to the normal ?ket-qua= flow. */
function BankTransfer({ paymentId, expiresAt, onBack }: { paymentId: string; expiresAt?: string | null; onBack: () => void }) {
  const [, setSearch] = useSearchParams();
  const { data: payment, isError } = useQuery({
    queryKey: ["payment", paymentId],
    queryFn: () => paymentApi.get(paymentId),
    refetchInterval: (q) => (q.state.data?.status === "PENDING" ? 3000 : false),
  });

  useEffect(() => {
    if (payment && payment.status !== "PENDING") {
      setSearch({ "ket-qua": payment.status === "SUCCEEDED" ? "success" : "fail" }, { replace: true });
    }
  }, [payment, setSearch]);

  if (isError) {
    return (
      <Result title="Không tải được thông tin chuyển khoản" tone="danger">
        <button onClick={onBack} className="btn-primary mt-4">
          Quay lại
        </button>
      </Result>
    );
  }
  if (!payment) return <PageSpinner />;
  const info = payment.bankTransfer;
  if (!info) return <PageSpinner />;

  const rows: Array<[string, string]> = [
    ["Ngân hàng", info.bankName],
    ["Số tài khoản", info.accountNumber],
    ["Chủ tài khoản", info.accountName],
    ["Số tiền", formatVnd(info.amount)],
    ["Nội dung", info.transferContent],
  ];

  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="text-2xl">Chuyển khoản ngân hàng</h1>
      {expiresAt && (
        <p className="mt-1 text-sm text-brand-600">
          Giữ chỗ hết hạn sau <span className="font-mono font-bold">{timeLeft(expiresAt)}</span>
        </p>
      )}
      <div className="card mt-6 grid gap-6 p-6 sm:grid-cols-2">
        <img src={info.qrImageUrl} alt="Mã VietQR chuyển khoản" className="mx-auto w-full max-w-xs rounded-xl" />
        <div className="space-y-3 text-sm">
          <p className="text-ink-500">Quét mã bằng ứng dụng ngân hàng, hoặc chuyển khoản thủ công với thông tin sau:</p>
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 border-b border-ink-100 pb-2">
              <span className="text-ink-500">{label}</span>
              <span className="flex items-center gap-2 font-semibold text-ink-900">
                <span className={label === "Nội dung" ? "font-mono text-brand-600" : ""}>{value}</span>
                {(label === "Số tài khoản" || label === "Nội dung") && (
                  <button onClick={() => navigator.clipboard?.writeText(value)} className="btn-ghost px-2 py-0.5 text-xs">
                    Sao chép
                  </button>
                )}
              </span>
            </div>
          ))}
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Nhập <strong>đúng số tiền</strong> và <strong>giữ nguyên nội dung</strong> chuyển khoản — hệ thống dựa vào nội dung này để
            xác nhận đơn tự động.
          </p>
          <p className="flex items-center gap-2 text-ink-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />
            Đang chờ nhận tiền — trang sẽ tự chuyển khi thanh toán thành công.
          </p>
        </div>
      </div>
      <button onClick={onBack} className="btn-ghost mt-6 text-sm">
        Chọn phương thức khác
      </button>
    </div>
  );
}

function Result({
  title,
  tone = "neutral",
  spinner,
  children,
}: {
  title: string;
  tone?: "success" | "danger" | "neutral";
  spinner?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="container-page flex min-h-[60vh] max-w-xl flex-col items-center justify-center py-16 text-center">
      {spinner && <PageSpinner />}
      <Badge tone={tone === "success" ? "success" : tone === "danger" ? "danger" : "neutral"}>{title}</Badge>
      <h1 className="mt-3 text-2xl">{title}</h1>
      <div className="mt-3 text-sm leading-relaxed text-ink-500">{children}</div>
    </div>
  );
}
