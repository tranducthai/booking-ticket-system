import { escapeHtml } from "./escape-html";
import { callout, detailsTable, emailButton, emailLayout, greeting, paragraph, signoff, subjectLine } from "./layout";
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
    subject: subjectLine(`Sự kiện đã được duyệt: ${eventTitle}`),
    html: emailLayout({
      title: "Sự kiện của bạn đã được duyệt",
      preheader: `${eventTitle} đã hiển thị công khai và sẵn sàng bán vé.`,
      body: [
        greeting(fullName),
        paragraph(`Chúng tôi vui mừng thông báo sự kiện <strong>${escapeHtml(eventTitle)}</strong> của bạn đã được <strong style="color:#1a9d5a">duyệt</strong>.`),
        callout("success", "Sự kiện hiện đã được <strong>hiển thị công khai</strong> và khách hàng có thể bắt đầu mua vé theo thời gian mở bán bạn đã thiết lập."),
        paragraph("Bạn có thể theo dõi doanh thu, danh sách khách tham dự, check-in và các yêu cầu hoàn vé ngay trong trang quản lý sự kiện."),
        emailButton(manageUrl, "Quản lý sự kiện"),
        paragraph("Chúc sự kiện của bạn thành công tốt đẹp!"),
        signoff(),
      ].join("\n"),
    }),
  };
}

/** Sent to the organizer on EventRejected — with the reviewer's reason, so they can fix and resubmit. */
export function eventRejectedEmail({ fullName, eventTitle, manageUrl, reason }: EventReviewEmailData & { reason: string }): EmailContent {
  return {
    subject: subjectLine(`Sự kiện chưa được duyệt: ${eventTitle}`),
    html: emailLayout({
      title: "Sự kiện của bạn chưa được duyệt",
      preheader: `${eventTitle} cần được chỉnh sửa trước khi được duyệt.`,
      body: [
        greeting(fullName),
        paragraph(`Sau khi xem xét, sự kiện <strong>${escapeHtml(eventTitle)}</strong> của bạn <strong style="color:#c53030">chưa đủ điều kiện được duyệt</strong> ở thời điểm hiện tại.`),
        callout("danger", `<strong>Góp ý từ người duyệt:</strong><br/>${escapeHtml(reason)}`),
        paragraph("Bạn có thể chỉnh sửa thông tin sự kiện theo góp ý ở trên, sau đó gửi duyệt lại. Chúng tôi sẽ xem xét lại trong thời gian sớm nhất."),
        emailButton(manageUrl, "Chỉnh sửa sự kiện"),
        paragraph("Nếu bạn cần làm rõ thêm về góp ý, vui lòng liên hệ bộ phận hỗ trợ của EventPass."),
        signoff(),
      ].join("\n"),
    }),
  };
}
