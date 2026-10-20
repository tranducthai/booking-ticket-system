import { useState } from "react";
import { apiErrorMessage } from "../../api/client";
import {
  EVIDENCE_ACCEPT,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_FILES,
  paymentApi,
  REFUND_ACTION_LABEL,
  REFUND_KIND_LABEL,
  REFUND_REASON_LABEL,
  REFUND_STATUS_LABEL,
  REFUND_STATUS_TONE,
} from "../../api/payment";
import type { Refund } from "../../api/types";
import { formatDateTime, formatVnd } from "../../lib/format";
import { Badge } from "../ui/Badge";

/** Status badge + amounts block shared by the customer, organizer and admin refund views. */
export function RefundSummary({ refund }: { refund: Refund }) {
  const gross = refund.grossAmount ?? refund.amount;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={REFUND_STATUS_TONE[refund.status]}>{REFUND_STATUS_LABEL[refund.status]}</Badge>
          <span className="text-xs text-ink-400">{REFUND_KIND_LABEL[refund.kind]}</span>
          {refund.reasonCategory && <span className="text-xs text-ink-400">· {REFUND_REASON_LABEL[refund.reasonCategory]}</span>}
        </div>
        <p className="mt-2 font-mono text-xs text-ink-400">
          Đơn #{refund.orderId.slice(0, 8)}
          {refund.orderItemIds.length > 0 && ` · ${refund.orderItemIds.length} vé`} · {formatDateTime(refund.createdAt)}
        </p>
        <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{refund.reason}</p>
        {refund.infoRequest && refund.status === "NEED_INFO" && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Cần bổ sung: {refund.infoRequest}</p>
        )}
        {refund.rejectReason && (refund.status === "REJECTED" || refund.status === "REJECTED_FINAL") && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Lý do từ chối: {refund.rejectReason}</p>
        )}
        {refund.status === "FAILED" && refund.lastError && <p className="mt-2 text-xs text-red-600">Lỗi cổng thanh toán: {refund.lastError}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-lg font-extrabold text-ink-900">{formatVnd(refund.amount)}</p>
        <p className="text-xs text-ink-500">
          {refund.refundPercent}% của {formatVnd(gross)}
        </p>
        {Number(refund.feeAmount) > 0 && <p className="text-xs text-ink-400">Giữ lại {formatVnd(refund.feeAmount)}</p>}
      </div>
    </div>
  );
}

/** Evidence files are behind auth — fetched as a blob and opened via an object URL. */
export function EvidenceList({ refund }: { refund: Refund }) {
  const [error, setError] = useState<string | null>(null);
  if (refund.evidence.length === 0) return null;

  const open = async (evidenceId: string) => {
    setError(null);
    try {
      const blob = await paymentApi.refunds.evidenceBlob(refund.id, evidenceId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(apiErrorMessage(err, "Không mở được tệp."));
    }
  };

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Minh chứng</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {refund.evidence.map((e) => (
          <button key={e.id} onClick={() => void open(e.id)} className="rounded-lg bg-ink-50 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-100">
            📎 {e.fileName} <span className="font-normal text-ink-400">({Math.ceil(e.sizeBytes / 1024)} KB)</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function RefundTimeline({ refund }: { refund: Refund }) {
  const [open, setOpen] = useState(false);
  if (refund.auditLogs.length === 0) return null;
  return (
    <div className="mt-3">
      <button onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-ink-500 hover:text-ink-700">
        {open ? "Ẩn lịch sử xử lý" : `Lịch sử xử lý (${refund.auditLogs.length})`}
      </button>
      {open && (
        <ol className="mt-2 space-y-1 border-l-2 border-ink-100 pl-3">
          {refund.auditLogs.map((log) => (
            <li key={log.id} className="text-xs text-ink-600">
              <span className="text-ink-400">{formatDateTime(log.createdAt)}</span> — {REFUND_ACTION_LABEL[log.action] ?? log.action}
              {log.actorId === "system" && " (hệ thống)"}
              {log.note && <span className="text-ink-500">: {log.note}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** File picker enforcing the same limits as the backend, so the user hears about it before uploading. */
export function EvidencePicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <input
        type="file"
        multiple
        accept={EVIDENCE_ACCEPT}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          const tooBig = picked.find((f) => f.size > MAX_EVIDENCE_BYTES);
          if (picked.length > MAX_EVIDENCE_FILES) setError(`Tối đa ${MAX_EVIDENCE_FILES} tệp.`);
          else if (tooBig) setError(`"${tooBig.name}" vượt quá 10MB.`);
          else {
            setError(null);
            onChange(picked);
            return;
          }
          e.target.value = "";
          onChange([]);
        }}
        className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold"
      />
      <p className="mt-1 text-xs text-ink-400">Ảnh JPG/PNG/WEBP hoặc PDF, tối đa {MAX_EVIDENCE_FILES} tệp, mỗi tệp 10MB.</p>
      {files.length > 0 && <p className="mt-1 text-xs text-ink-600">Đã chọn: {files.map((f) => f.name).join(", ")}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
