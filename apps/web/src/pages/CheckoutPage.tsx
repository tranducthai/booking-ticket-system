import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { check } from "../lib/validation";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { bookingApi, ORDER_STATUS_LABEL } from "../api/booking";
import { eventsApi } from "../api/events";
import { paymentApi } from "../api/payment";
import { Badge } from "../components/ui/Badge";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTimeRange, formatVnd } from "../lib/format";

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

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => bookingApi.getOrder(orderId),
    refetchInterval: (q) => (returning && q.state.data?.status === "PENDING_PAYMENT" ? 1500 : false),
  });

  const { data: event } = useQuery({
    queryKey: ["event", order?.eventId],
    queryFn: () => eventsApi.getById(order!.eventId!),
    enabled: !!order?.eventId,
  });

  const [code, setCode] = useState("");
  const [method, setMethod] = useState("vnpay");
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const { user } = useAuth();
  const [, forceTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const discountMutation = useMutation({
    mutationFn: () => {
      check(/^[A-Z0-9_-]{3,20}$/.test(code.trim().toUpperCase()) ? null : "Mã giảm giá không hợp lệ");
      return bookingApi.applyDiscount(orderId, code.trim().toUpperCase());
    },
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

  const freeMutation = useMutation({
    mutationFn: () => bookingApi.confirmFree(orderId),
    onSuccess: () => navigate(`/orders/${orderId}`),
    onError: (err) => setError(apiErrorMessage(err, "Không thể xác nhận đăng ký.")),
  });

  if (isError && !order) {
    // An unpaid order is deleted once its 10 minutes are up, so opening its checkout link later finds nothing.
    return (
      <Result title="Hết thời gian đặt vé" tone="danger">
        Đơn hàng không còn nữa vì đã quá 10 phút chưa thanh toán. Vé đã được nhả lại — bạn có thể đặt lại.
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/events" className="btn-primary">
            Xem sự kiện
          </Link>
        </div>
      </Result>
    );
  }
  if (isLoading || !order) return <PageSpinner />;
  const isMembership = order.kind === "MEMBERSHIP";
  const isResale = order.kind === "RESALE";

  if (returning) {
    if (order.status === "PENDING_PAYMENT") {
      return (
        <Result title="Đang xác nhận thanh toán..." spinner>
          Chỉ mất vài giây — trang sẽ tự cập nhật.
        </Result>
      );
    }
    if (isMembership && order.status === "PAID") {
      return (
        <Result title="Đăng ký thành viên thành công 🎉" tone="success">
          {order.itemLabel} đã được kích hoạt. Ưu đãi mua sớm và giảm giá áp dụng ngay cho các sự kiện tham gia chương trình.
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/memberships" className="btn-primary">
              Xem thẻ thành viên
            </Link>
          </div>
        </Result>
      );
    }
    if (order.status === "PAID" || order.status === "TICKET_ISSUED") {
      return (
        <Result title="Thanh toán thành công 🎉" tone="success">
          Vé điện tử của bạn đang được tạo và sẽ có trong mục{" "}
          <Link to="/my-tickets" className="font-semibold text-brand-600 underline">
            Vé của tôi
          </Link>{" "}
          trong giây lát. Chúng tôi cũng đã gửi email xác nhận.
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/my-tickets" className="btn-primary">
              Xem vé của tôi
            </Link>
            <Link to={`/orders/${orderId}`} className="btn-secondary">
              Xem đơn hàng
            </Link>
          </div>
        </Result>
      );
    }
    return (
      <Result title="Thanh toán không thành công" tone="danger">
        Đơn hàng của bạn chưa được thanh toán. Vé giữ cho bạn sẽ được nhả lại khi hết 10 phút.
        <div className="mt-6 flex justify-center gap-3">
          <Link to={event ? `/events/${event.id}` : isMembership ? "/memberships" : "/events"} className="btn-primary">
            Thử lại
          </Link>
        </div>
      </Result>
    );
  }

  if (transferPaymentId && order.status === "PENDING_PAYMENT") {
    return <BankTransfer paymentId={transferPaymentId} expiresAt={order.expiresAt} onBack={() => navigate(`/checkout/${orderId}`)} />;
  }

  if (order.status !== "PENDING_PAYMENT") {
    return (
      <Result title={ORDER_STATUS_LABEL[order.status]} tone={order.status === "PAID" ? "success" : "neutral"}>
        <Link to={`/orders/${orderId}`} className="btn-primary mt-4">
          Xem đơn hàng
        </Link>
      </Result>
    );
  }

  const msLeft = order.expiresAt ? new Date(order.expiresAt).getTime() - Date.now() : null;
  if (msLeft !== null && msLeft <= 0) {
    return (
      <Result title="Hết thời gian đặt vé" tone="danger">
        Đơn hàng chưa được thanh toán trong 10 phút nên đã hết hạn và vé đã được nhả lại cho người khác. Bạn có thể đặt lại.
        <div className="mt-6 flex justify-center gap-3">
          <Link to={event ? `/events/${event.id}` : isMembership ? "/memberships" : "/events"} className="btn-primary">
            Đặt lại
          </Link>
        </div>
      </Result>
    );
  }

  const free = Number(order.totalAmount) === 0;
  // One line per ticket type and price: "VIP × 2".
  const lines = new Map<string, { label: string; quantity: number; amount: number }>();
  for (const item of order.items) {
    // The ticket type's name from the event (e.g. "VIP"); a seat shows as "Ghế".
    const label = item.seatId ? "Ghế" : (event?.ticketTypes?.find((t) => t.id === item.ticketTypeId)?.name ?? "Vé");
    const key = `${label}:${item.price}`;
    const line = lines.get(key) ?? { label, quantity: 0, amount: 0 };
    line.quantity += item.quantity;
    line.amount += Number(item.price) * item.quantity;
    lines.set(key, line);
  }

  return (
    <div>
      <div className="bg-ink-900 text-white">
        <div className="container-page flex flex-wrap items-center justify-between gap-6 py-8">
          <div className="min-w-0 flex-1 space-y-3">
            <h1 className="text-2xl font-extrabold uppercase leading-tight text-white sm:text-3xl">{event?.title ?? order.itemLabel ?? "Đơn hàng"}</h1>
            {event && (
              <>
                <p className="border-t border-white/20 pt-3 text-sm font-semibold">{formatDateTimeRange(event.startTime, event.endTime)}</p>
                <p className="text-sm text-white/80">{event.isOnline ? `Sự kiện trực tuyến · ${event.venueName}` : `${event.venueName} · ${event.venueAddress}`}</p>
              </>
            )}
          </div>
          {msLeft !== null && <CountdownBox msLeft={msLeft} />}
        </div>
      </div>

      <div className="container-page py-8">
        <h2 className="text-xl font-extrabold uppercase text-brand-600">Thanh toán</h2>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <section className="card p-5">
              <h3 className="font-bold text-brand-600">Thông tin nhận vé</h3>
              <p className="mt-2 text-sm text-ink-700">
                {isMembership ? "Thẻ thành viên được kích hoạt ngay trên tài khoản" : <>Vé điện tử sẽ được hiển thị trong mục <strong>"Vé của tôi"</strong> của tài khoản</>}
              </p>
              <p className="text-sm text-ink-700">{user?.email}</p>
            </section>

            {!isMembership && !isResale && (
              <section className="card p-5">
                <h3 className="font-bold text-brand-600">Mã khuyến mãi</h3>
                <div className="mt-3 flex gap-2">
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Nhập mã khuyến mãi" className="input" />
                  <button onClick={() => discountMutation.mutate()} disabled={!code || discountMutation.isPending} className="btn-secondary shrink-0">
                    Áp dụng
                  </button>
                </div>
                {order.discountCode && (
                  <p className="mt-2 text-sm text-emerald-600">
                    Đã áp dụng mã <strong>{order.discountCode}</strong> · -{formatVnd(order.discountAmount)}
                  </p>
                )}
              </section>
            )}

            {isResale && (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">
                {order.itemLabel} — vé mua lại từ khách khác. Sau khi thanh toán, vé cũ bị vô hiệu và bạn nhận vé điện tử mới với mã QR riêng.
                Vé mua lại không hỗ trợ yêu cầu hoàn tiền (chỉ hoàn khi sự kiện bị huỷ).
              </p>
            )}

            {!free && (
              <section className="card p-5">
                <h3 className="font-bold text-brand-600">Phương thức thanh toán</h3>
                <div className="mt-3 space-y-2">
                  {METHODS.map((m) => (
                    <label
                      key={m.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors ${
                        method === m.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-100 text-ink-700 hover:border-ink-200"
                      }`}
                    >
                      <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} className="h-4 w-4 accent-brand-500" />
                      {m.label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-400">
                  Demo: khi PAYMENT_GATEWAY_MODE=mock (mặc định), mọi phương thức đều đi qua cùng cổng thanh toán mô phỏng.
                </p>
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <section className="card p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-ink-900">Thông tin đặt vé</h3>
                {event && (
                  <Link to={`/events/${event.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
                    Chọn lại vé
                  </Link>
                )}
              </div>
              <div className="mt-3 flex justify-between text-xs font-bold uppercase text-ink-500">
                <span>Loại vé</span>
                <span>Số lượng</span>
              </div>
              <div className="mt-2 space-y-3 text-sm">
                {isMembership && (
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-800">{order.itemLabel ?? "Thẻ thành viên"}</span>
                    <span className="font-mono">01</span>
                  </div>
                )}
                {[...lines.values()].map((line) => (
                  <div key={`${line.label}${line.amount}`} className="flex justify-between gap-3">
                    <div>
                      <p className="text-ink-800">{line.label}</p>
                      <p className="text-xs text-ink-500">{formatVnd(line.amount / line.quantity)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono">{String(line.quantity).padStart(2, "0")}</p>
                      <p className="text-xs text-ink-500">{formatVnd(line.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-5">
              <h3 className="font-bold text-ink-900">Thông tin đơn hàng</h3>
              <div className="mt-3 space-y-1 border-b border-dashed border-ink-200 pb-3 text-sm">
                <div className="flex justify-between text-ink-600">
                  <span>Tạm tính</span>
                  <span>{formatVnd(order.subtotal)}</span>
                </div>
                {Number(order.memberDiscountAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Ưu đãi thẻ thành viên</span>
                    <span>-{formatVnd(order.memberDiscountAmount!)}</span>
                  </div>
                )}
                {Number(order.discountAmount) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Giảm giá</span>
                    <span>-{formatVnd(order.discountAmount)}</span>
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-bold text-ink-900">Tổng tiền</span>
                <span className="text-xl font-extrabold text-brand-600">{formatVnd(order.totalAmount)}</span>
              </div>

              <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs text-ink-500">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" />
                <span>Bằng việc tiến hành đặt mua, bạn đã đồng ý với Điều kiện, Điều khoản của nền tảng.</span>
              </label>

              {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

              {free ? (
                <button onClick={() => freeMutation.mutate()} disabled={!agreed || freeMutation.isPending} className="btn-primary mt-4 w-full py-3 text-base">
                  {freeMutation.isPending ? "Đang xác nhận..." : "Xác nhận đăng ký (miễn phí)"}
                </button>
              ) : (
                <button onClick={() => payMutation.mutate()} disabled={!agreed || payMutation.isPending} className="btn-primary mt-4 w-full py-3 text-base">
                  {payMutation.isPending ? "Đang chuyển hướng..." : "Thanh toán"}
                </button>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** "Hoàn tất đặt vé trong  13 : 37" — the 10-minute window to pay the order. */
function CountdownBox({ msLeft }: { msLeft: number }) {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  const digit = "flex h-16 w-16 items-center justify-center rounded-xl bg-red-500 text-3xl font-extrabold tabular-nums";
  return (
    <div className="rounded-2xl bg-white/10 px-6 py-5 text-center ring-1 ring-white/15">
      <p className="text-sm font-semibold">Hoàn tất đặt vé trong</p>
      <div className="mt-3 flex items-center justify-center gap-2">
        <span className={digit}>{mm}</span>
        <span className="text-2xl font-extrabold">:</span>
        <span className={digit}>{ss}</span>
      </div>
    </div>
  );
}

/** Compact countdown for the bank-transfer page; a transfer that lands after it is refunded (the tickets were released). */
function CountdownLine({ expiresAt }: { expiresAt: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) {
    return <p className="mt-1 text-sm text-amber-700">Đã hết thời gian giữ vé — vé đã được nhả lại. Nếu bạn vừa chuyển khoản, khoản tiền sẽ được hoàn lại.</p>;
  }
  const total = Math.floor(ms / 1000);
  return (
    <p className="mt-1 text-sm text-brand-600">
      Hoàn tất đặt vé trong{" "}
      <span className="font-mono font-bold">
        {String(Math.floor(total / 60)).padStart(2, "0")}:{String(total % 60).padStart(2, "0")}
      </span>
    </p>
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
      {expiresAt && <CountdownLine expiresAt={expiresAt} />}
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
