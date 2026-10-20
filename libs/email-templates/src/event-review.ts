import { emailButton } from "./button";
import { escapeHtml } from "./escape-html";
import { EmailContent } from "./types";

export interface EventReviewEmailData {
  fullName: string;
  eventTitle: string;
  /** Absolute link to the event in the organizer console. */
  manageUrl: string;
}

/** Sent to the organizer on EventApproved — the event is now public and on sale. */
export function eventApprovedEmail({ fullName, eventTitle, manageUrl }: EventReviewEmailData): EmailContent {
  return {
    subject: `Sự kiện đã được duyệt: ${eventTitle}`,
    html: `<p>Chào ${escapeHtml(fullName)},</p>
           <p>Sự kiện <strong>${escapeHtml(eventTitle)}</strong> của bạn đã được <strong style="color:#2dc275">duyệt</strong> và đang hiển thị công khai — khách hàng đã có thể mua vé.</p>
           ${emailButton(manageUrl, "Quản lý sự kiện")}
           <p>Chúc sự kiện thành công!</p>`,
  };
}

/** Sent to the organizer on EventRejected — with the reviewer's reason, so they can fix and resubmit. */
export function eventRejectedEmail({ fullName, eventTitle, manageUrl, reason }: EventReviewEmailData & { reason: string }): EmailContent {
  return {
    subject: `Sự kiện chưa được duyệt: ${eventTitle}`,
    html: `<p>Chào ${escapeHtml(fullName)},</p>
           <p>Sự kiện <strong>${escapeHtml(eventTitle)}</strong> của bạn <strong style="color:#e5484d">chưa được duyệt</strong>.</p>
           <p style="padding:12px 16px;border-left:4px solid #e5484d;background:#fff5f5">Lý do: ${escapeHtml(reason)}</p>
           <p>Bạn có thể chỉnh sửa thông tin theo góp ý rồi gửi duyệt lại.</p>
           ${emailButton(manageUrl, "Chỉnh sửa sự kiện")}`,
  };
}
