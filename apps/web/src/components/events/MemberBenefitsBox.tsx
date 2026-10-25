import { Link } from "react-router-dom";
import type { EventMemberBenefits } from "../../api/types";
import { formatDateTime, formatVnd } from "../../lib/format";

/**
 * Event page: which artists' membership cards count here and what they give.
 * The viewer's own card (if any) is called out, with the presale window when
 * sales haven't opened yet.
 */
export function MemberBenefitsBox({ benefits, salesStart }: { benefits: EventMemberBenefits; salesStart: Date | null }) {
  if (!benefits.memberBenefits || (benefits.offers.length === 0 && !benefits.member)) return null;
  const { member } = benefits;
  const presaleOpens = member && salesStart && member.presaleHours > 0 ? new Date(salesStart.getTime() - member.presaleHours * 3_600_000) : null;

  return (
    <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm">
      <p className="font-bold text-brand-700">Ưu đãi thẻ thành viên</p>
      {member ? (
        <p className="mt-1 text-ink-700">
          Bạn có thẻ thành viên <strong>{member.artistName}</strong> ({member.cardNumber})
          {member.discountPercent > 0 && <> — được giảm <strong>{member.discountPercent}%</strong> giá vé</>}
          {presaleOpens && salesStart!.getTime() > Date.now() && (
            <>
              {" "}
              và mua sớm từ <strong>{formatDateTime(presaleOpens.toISOString())}</strong>
            </>
          )}
          .
        </p>
      ) : (
        <ul className="mt-1 space-y-1 text-ink-700">
          {benefits.offers.map((o) => (
            <li key={o.planId}>
              Thành viên <strong>{o.artistName}</strong>:
              {o.discountPercent > 0 && ` giảm ${o.discountPercent}%`}
              {o.discountPercent > 0 && o.presaleHours > 0 && ","}
              {o.presaleHours > 0 && ` mua sớm ${o.presaleHours} giờ`}.{" "}
              <Link to={`/nghe-si/${o.artistId}`} className="font-semibold text-brand-600 hover:underline">
                {o.price === 0 ? "Đăng ký miễn phí" : `Mua thẻ ${formatVnd(o.price)}`}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
