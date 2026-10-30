import { escapeHtml } from "./escape-html";
import { callout, emailButton, emailLayout, fallbackLink, greeting, paragraph, signoff, subjectLine } from "./layout";
import { EmailContent } from "./types";

export interface PasswordResetEmailData {
  fullName: string;
  resetUrl: string;
  /** How long the link stays valid, already human-readable ("30 phút"). */
  validFor: string;
}

/** "Quên mật khẩu" — sent on PasswordResetRequested (user-service). */
export function passwordResetEmail({ fullName, resetUrl, validFor }: PasswordResetEmailData): EmailContent {
  return {
    subject: subjectLine("Yêu cầu đặt lại mật khẩu"),
    html: emailLayout({
      title: "Đặt lại mật khẩu",
      preheader: `Liên kết đặt lại mật khẩu có hiệu lực trong ${validFor}.`,
      body: [
        greeting(fullName),
        paragraph("Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản EventPass của bạn. Bấm vào nút bên dưới để tạo mật khẩu mới:"),
        emailButton(resetUrl, "Đặt lại mật khẩu"),
        callout("warning", `Liên kết chỉ dùng được <strong>một lần</strong> và hết hạn sau <strong>${escapeHtml(validFor)}</strong>. Sau khi đổi mật khẩu thành công, các thiết bị đang đăng nhập sẽ bị đăng xuất.`),
        fallbackLink(resetUrl),
        paragraph("<strong>Không phải bạn yêu cầu?</strong> Hãy bỏ qua email này — mật khẩu của bạn vẫn được giữ nguyên và không ai có thể truy cập tài khoản nếu không có liên kết trên. Nếu bạn nhận được email này nhiều lần ngoài ý muốn, chúng tôi khuyến nghị bạn đổi mật khẩu."),
        signoff(),
      ].join("\n"),
    }),
  };
}
