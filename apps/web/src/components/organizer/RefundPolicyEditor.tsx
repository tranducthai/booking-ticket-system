import { REFUND_REASON_LABEL } from "../../api/payment";
import type { RefundPolicy, RefundReasonCategory } from "../../api/types";

/** A sensible starting point an organizer can tweak — same tiers as the design doc's example. */
export const SUGGESTED_REFUND_POLICY: RefundPolicy = {
  customerRefundable: true,
  tiers: [
    { minHoursBefore: 168, percent: 80 },
    { minHoursBefore: 72, percent: 50 },
    { minHoursBefore: 0, percent: 0 },
  ],
  evidenceRequiredFor: ["MEDICAL"],
};

/**
 * Event.refundPolicy (docs/spec/13-refund-and-anti-fraud-design.md §2.1).
 * Only governs customer-initiated refunds — cancellation/postponement
 * always refund 100% regardless. Locked once the event leaves draft.
 */
export function RefundPolicyEditor({ value, onChange }: { value: RefundPolicy; onChange: (policy: RefundPolicy) => void }) {
  const setTier = (i: number, patch: Partial<RefundPolicy["tiers"][number]>) =>
    onChange({ ...value, tiers: value.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  return (
    <div className="rounded-xl ring-1 ring-ink-100 p-4">
      <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
        <input type="checkbox" checked={value.customerRefundable} onChange={(e) => onChange({ ...value, customerRefundable: e.target.checked })} />
        Cho phép khách yêu cầu hoàn vé
      </label>
      <p className="mt-1 text-xs text-ink-400">Nếu sự kiện bị hủy hoặc dời lịch, người mua luôn được hoàn 100% bất kể chính sách này. Chính sách bị khóa sau khi gửi duyệt.</p>

      {value.customerRefundable && (
        <>
          <label className="mt-3 flex items-start gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={value.autoApprove ?? false}
              onChange={(e) => onChange({ ...value, autoApprove: e.target.checked })}
            />
            <span>
              <span className="font-semibold">Hoàn tiền tự động</span>
              <span className="block text-xs text-ink-400">
                Khách hủy vé đúng chính sách là được hoàn tiền ngay, không cần bạn duyệt. Lý do bắt buộc minh chứng vẫn chờ bạn xem xét.
              </span>
            </span>
          </label>
          <div className="mt-3 space-y-2">
            {value.tiers.map((tier, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
                Yêu cầu trước giờ diễn ≥
                <input
                  type="number"
                  min={0}
                  value={tier.minHoursBefore}
                  onChange={(e) => setTier(i, { minHoursBefore: Number(e.target.value) })}
                  className="input w-20 py-1"
                />
                giờ → hoàn
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={tier.percent}
                  onChange={(e) => setTier(i, { percent: Number(e.target.value) })}
                  className="input w-20 py-1"
                />
                %
                <button type="button" onClick={() => onChange({ ...value, tiers: value.tiers.filter((_, j) => j !== i) })} className="text-xs text-red-600 hover:underline">
                  Xóa
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange({ ...value, tiers: [...value.tiers, { minHoursBefore: 24, percent: 0 }] })}
              className="text-xs font-semibold text-brand-600 hover:underline"
            >
              + Thêm mốc
            </button>
          </div>

          <p className="mt-3 text-xs font-semibold text-ink-500">Bắt buộc đính kèm minh chứng khi lý do là:</p>
          <div className="mt-1 flex flex-wrap gap-3">
            {(Object.keys(REFUND_REASON_LABEL) as RefundReasonCategory[]).map((cat) => (
              <label key={cat} className="flex items-center gap-1 text-xs text-ink-600">
                <input
                  type="checkbox"
                  checked={value.evidenceRequiredFor?.includes(cat) ?? false}
                  onChange={(e) => {
                    const current = value.evidenceRequiredFor ?? [];
                    onChange({ ...value, evidenceRequiredFor: e.target.checked ? [...current, cat] : current.filter((c) => c !== cat) });
                  }}
                />
                {REFUND_REASON_LABEL[cat]}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
