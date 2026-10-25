import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiErrorMessage } from "../api/client";
import { TICKET_STATUS_LABEL, TICKET_STATUS_TONE, ticketsApi } from "../api/tickets";
import { ResellBox } from "../components/resale/ResellBox";
import type { TicketDetail } from "../api/types";
import { Badge } from "../components/ui/Badge";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTime } from "../lib/format";
import { currentStep, dynamicQrCode } from "../lib/dynamicQr";

/**
 * Rotating QR first (docs/spec/13-refund-and-anti-fraud-design.md §3.2):
 * the code changes every `stepSeconds`, so a screenshot is dead within a
 * minute — the "one screenshot sold to ten buyers" scam stops working.
 * The static QR is only offered as a fallback when the deployment still
 * accepts it.
 */
export function TicketDetailPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { data: ticket, isLoading } = useQuery({ queryKey: ["ticket", id], queryFn: () => ticketsApi.get(id) });
  const [showStatic, setShowStatic] = useState(false);
  const [reissueError, setReissueError] = useState<string | null>(null);

  const reissue = useMutation({
    mutationFn: () => ticketsApi.reissueQr(id),
    onSuccess: (updated) => {
      qc.setQueryData(["ticket", id], updated);
      setReissueError(null);
    },
    onError: (err) => setReissueError(apiErrorMessage(err, "Không thể cấp lại mã.")),
  });

  if (isLoading || !ticket) return <PageSpinner />;

  return (
    <div className="container-page max-w-md py-10">
      <Link to="/ve-cua-toi" className="text-sm font-semibold text-ink-500 hover:text-ink-700">
        ← Vé của tôi
      </Link>

      <div className="card mt-4 overflow-hidden">
        <div className="bg-gradient-to-br from-ink-800 to-ink-900 px-6 py-5 text-white">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-300">Vé điện tử</p>
          <p className="mt-1 font-mono text-xs text-ink-300">#{ticket.id}</p>
        </div>

        <div className="flex flex-col items-center border-b border-dashed border-ink-200 p-8">
          {ticket.dynamicQr && !showStatic ? (
            <RotatingQr ticket={ticket} seed={ticket.dynamicQr.seed} stepSeconds={ticket.dynamicQr.stepSeconds} />
          ) : ticket.qrPayload && showStatic ? (
            <>
              <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100">
                <QRCodeSVG value={ticket.qrPayload} size={200} />
              </div>
              <p className="mt-4 text-center text-xs text-ink-400">Mã tĩnh — chỉ dùng khi không mở được mã động. Không chia sẻ ảnh chụp mã này.</p>
            </>
          ) : (
            <p className="text-center text-sm text-ink-500">
              {ticket.status === "REFUND_PENDING"
                ? "Vé đang chờ hoàn tiền nên tạm khóa. Rút yêu cầu hoàn trong mục Đơn hàng nếu bạn muốn tham dự."
                : ticket.status === "RESALE_LISTED"
                  ? "Vé đang được rao bán lại nên tạm khóa. Huỷ tin bán bên dưới nếu bạn muốn tham dự."
                  : ticket.cancelReason === "RESOLD"
                    ? "Vé đã được bán lại cho người khác — mã QR này không còn hiệu lực."
                    : "Vé không còn hiệu lực."}
            </p>
          )}

          {ticket.dynamicQr && ticket.qrPayload && (
            <button onClick={() => setShowStatic((v) => !v)} className="mt-3 text-xs font-semibold text-brand-600 hover:underline">
              {showStatic ? "Quay lại mã động" : "Không quét được? Dùng mã tĩnh"}
            </button>
          )}
        </div>

        <div className="space-y-3 p-6">
          <Row label="Trạng thái">
            <Badge tone={TICKET_STATUS_TONE[ticket.status]}>{TICKET_STATUS_LABEL[ticket.status]}</Badge>
          </Row>
          <Row label="Phát hành">{formatDateTime(ticket.createdAt)}</Row>
          <Row label="Phiên bản mã">v{ticket.qrVersion}</Row>
          {ticket.checkedInAt && <Row label="Check-in lúc">{formatDateTime(ticket.checkedInAt)}</Row>}
        </div>

        {ticket.onlineUrl && (
          <div className="border-t border-ink-100 p-6">
            <p className="label">Link tham gia sự kiện trực tuyến</p>
            <a href={ticket.onlineUrl} target="_blank" rel="noreferrer" className="btn-primary mt-1 inline-flex">
              Tham gia sự kiện ↗
            </a>
            <p className="mt-2 text-xs text-ink-500">Link chỉ dành cho người có vé — vui lòng không chia sẻ.</p>
          </div>
        )}

        <ResellBox ticket={ticket} />

        {ticket.status === "ISSUED" && (
          <div className="border-t border-ink-100 p-6">
            <p className="text-xs text-ink-500">
              Lỡ chia sẻ ảnh vé hoặc nghi bị lộ mã? Cấp lại mã sẽ vô hiệu hóa mọi mã cũ (kể cả ảnh chụp).
            </p>
            {reissueError && <p className="mt-2 text-xs text-red-600">{reissueError}</p>}
            <button
              onClick={() => {
                if (confirm("Cấp lại mã? Mọi mã QR cũ của vé này sẽ không dùng được nữa.")) reissue.mutate();
              }}
              disabled={reissue.isPending}
              className="btn-secondary mt-3 w-full"
            >
              {reissue.isPending ? "Đang cấp lại..." : "Cấp lại mã QR"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RotatingQr({ ticket, seed, stepSeconds }: { ticket: TicketDetail; seed: string; stepSeconds: number }) {
  const [code, setCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(stepSeconds);

  useEffect(() => {
    let lastStep = -1;
    let cancelled = false;
    const tick = () => {
      const now = Date.now();
      const step = currentStep(stepSeconds, now);
      setSecondsLeft(stepSeconds - Math.floor((now / 1000) % stepSeconds));
      if (step !== lastStep) {
        lastStep = step;
        void dynamicQrCode(ticket.id, ticket.qrVersion, seed, step).then((c) => !cancelled && setCode(c));
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ticket.id, ticket.qrVersion, seed, stepSeconds]);

  return (
    <>
      <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100">
        {code ? <QRCodeSVG value={code} size={200} /> : <div className="h-[200px] w-[200px]" />}
      </div>
      <div className="mt-4 h-1 w-[200px] overflow-hidden rounded-full bg-ink-100">
        <div className="h-full bg-brand-500 transition-all duration-1000 ease-linear" style={{ width: `${(secondsLeft / stepSeconds) * 100}%` }} />
      </div>
      <p className="mt-3 text-center text-xs text-ink-400">
        Mã tự đổi sau {secondsLeft}s — ảnh chụp màn hình sẽ không dùng được. Mỗi vé chỉ quét được một lần.
      </p>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="font-semibold text-ink-800">{children}</span>
    </div>
  );
}
