import { escapeHtml } from "./escape-html";
import { callout, emailButton, emailLayout, fallbackLink, greeting, paragraph, signoff, subjectLine } from "./layout";
import { EmailContent } from "./types";

export interface PartnerInviteEmailData {
  fullName: string;
  inviteUrl: string;
  /** How long the link stays valid, already human-readable ("7 ngày"). */
  validFor: string;
}

/** "Mời làm đối tác" — sent on PartnerInvited (user-service); the organizer account is created when the link is used. */
export function partnerInviteEmail({ fullName, inviteUrl, validFor }: PartnerInviteEmailData): EmailContent {
  return {
    subject: subjectLine("Lời mời trở thành đối tác tổ chức sự kiện"),
    html: emailLayout({
      title: "Lời mời trở thành đối tác tổ chức sự kiện",
      preheader: "Đặt mật khẩu để kích hoạt tài khoản ban tổ chức của bạn trên EventPass.",
      body: [
        greeting(fullName),
        paragraph("EventPass trân trọng mời bạn trở thành <strong>đối tác tổ chức sự kiện</strong> trên nền tảng của chúng tôi."),
        paragraph("Để kích hoạt tài khoản ban tổ chức, vui lòng bấm vào nút bên dưới và đặt mật khẩu đăng nhập cho riêng bạn. Sau khi kích hoạt, bạn có thể tạo sự kiện, thiết lập vé, theo dõi doanh thu và quản lý khách tham dự."),
        emailButton(inviteUrl, "Đặt mật khẩu & kích hoạt tài khoản"),
        callout("warning", `Liên kết chỉ dùng được <strong>một lần</strong> và sẽ hết hạn sau <strong>${escapeHtml(validFor)}</strong>. Không chuyển tiếp email này cho người khác.`),
        fallbackLink(inviteUrl),
        paragraph("Nếu bạn không mong đợi lời mời này, hãy bỏ qua email — sẽ không có tài khoản nào được tạo."),
        signoff(),
      ].join("\n"),
    }),
  };
}
