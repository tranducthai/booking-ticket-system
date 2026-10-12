import { ACTIVITY_SOURCES } from "../api/activity";
import { ActivityFeed } from "../components/activity/ActivityFeed";

/**
 * "Hoạt động của tôi" — every role's own trail (docs/spec/14-activity-log-design.md §1):
 * what you did (logins, purchases, refund requests, event management) and
 * what happened to your orders/tickets (paid, issued, checked in, refunded).
 * Failed logins on your account show up here too.
 */
export function ActivityPage() {
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="text-2xl">Hoạt động của tôi</h1>
      <p className="mt-1 text-sm text-ink-500">
        Lịch sử đăng nhập, mua vé, thanh toán, hoàn tiền và check-in. Nếu thấy hoạt động lạ (ví dụ đăng nhập thất bại không phải do bạn), hãy đổi mật khẩu.
      </p>
      <div className="mt-6">
        <ActivityFeed scope={{ kind: "mine" }} sources={ACTIVITY_SOURCES} />
      </div>
    </div>
  );
}
