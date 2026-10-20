import { emailButton } from "./button";
import { escapeHtml } from "./escape-html";
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
    subject: "Đặt lại mật khẩu Ticketbox",
    html: `<p>Chào ${escapeHtml(fullName)},</p>
           <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Bấm nút bên dưới để tạo mật khẩu mới:</p>
           ${emailButton(resetUrl, "Đặt lại mật khẩu")}
           <p>Liên kết chỉ dùng được <strong>một lần</strong> và hết hạn sau <strong>${escapeHtml(validFor)}</strong>.</p>
           <p style="color:#666">Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn vẫn giữ nguyên.</p>
           <p style="color:#999;font-size:12px">Nút không hoạt động? Dán đường dẫn này vào trình duyệt:<br />${escapeHtml(resetUrl)}</p>`,
  };
}
