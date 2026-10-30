import { escapeHtml } from "./escape-html";

export const BRAND_NAME = "EventPass";
export const BRAND_COLOR = "#E8462A";
const INK = "#1b1d2a";
const MUTED = "#6b7080";

/** Subject lines all start the same way so the brand is recognisable in an inbox list. */
export const subjectLine = (text: string) => `[${BRAND_NAME}] ${text}`;

/** "Kính chào Nguyễn Văn A," */
export function greeting(fullName: string): string {
  return `<p style="margin:0 0 16px">Kính chào <strong>${escapeHtml(fullName)}</strong>,</p>`;
}

/** A paragraph of body copy (pass already-escaped HTML). */
export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;line-height:1.65">${html}</p>`;
}

/** The closing every email ends with. */
export function signoff(): string {
  return `<p style="margin:24px 0 0;line-height:1.65">Trân trọng,<br/><strong>Đội ngũ ${BRAND_NAME}</strong></p>`;
}

type CalloutTone = "info" | "success" | "warning" | "danger";
const CALLOUT: Record<CalloutTone, { border: string; bg: string }> = {
  info: { border: "#3b82f6", bg: "#eff6ff" },
  success: { border: "#2dc275", bg: "#f0fbf5" },
  warning: { border: "#f5a623", bg: "#fffaf0" },
  danger: { border: "#e5484d", bg: "#fff5f5" },
};

/** A highlighted note (reason, deadline, security warning…). Pass already-escaped HTML. */
export function callout(tone: CalloutTone, html: string): string {
  const { border, bg } = CALLOUT[tone];
  return `<div style="margin:0 0 16px;padding:12px 16px;border-left:4px solid ${border};background:${bg};border-radius:4px;line-height:1.6">${html}</div>`;
}

/** Label / value rows (order code, time, venue…). Values are already-escaped HTML. */
export function detailsTable(rows: Array<[label: string, valueHtml: string]>): string {
  const body = rows
    .map(
      ([label, value]) => `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eceef3;color:${MUTED};width:38%;vertical-align:top">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eceef3;color:${INK};font-weight:600;vertical-align:top">${value}</td>
        </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #eceef3;border-radius:8px;border-collapse:separate;font-size:14px">${body}</table>`;
}

/** Call-to-action link styled as a button. */
export function emailButton(href: string, label: string): string {
  return `<p style="margin:24px 0">
           <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;border-radius:8px;background:${BRAND_COLOR};color:#ffffff;font-weight:bold;text-decoration:none">${escapeHtml(label)}</a>
         </p>`;
}

/** The plain link under a button, for clients that don't render it. */
export function fallbackLink(href: string): string {
  return `<p style="margin:0 0 8px;color:#8a8fa0;font-size:12px;line-height:1.5">Nếu nút không hoạt động, hãy sao chép đường dẫn sau vào trình duyệt:<br/><span style="word-break:break-all">${escapeHtml(href)}</span></p>`;
}

export interface LayoutOptions {
  /** Short summary shown next to the subject in the inbox list; hidden in the message itself. */
  preheader?: string;
  /** Heading at the top of the message. */
  title: string;
  body: string;
}

/** Shared frame: brand bar, white card with the title and body, and a footer explaining this is an automated message. */
export function emailLayout({ preheader, title, body }: LayoutOptions): string {
  return `<!doctype html>
<html lang="vi">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};font-size:15px">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
        <tr><td style="padding:0 4px 16px;font-size:22px;font-weight:800;color:${INK}">Event<span style="color:${BRAND_COLOR}">Pass</span></td></tr>
        <tr><td style="background:#ffffff;border-radius:12px;padding:32px 32px 28px;box-shadow:0 1px 3px rgba(20,22,40,0.08)">
          <h1 style="margin:0 0 20px;font-size:21px;line-height:1.3;color:${INK}">${escapeHtml(title)}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:20px 8px 0;color:#8a8fa0;font-size:12px;line-height:1.6;text-align:center">
          Đây là email tự động từ ${BRAND_NAME}, vui lòng không trả lời trực tiếp email này.<br/>
          Nếu bạn không thực hiện hoặc không mong đợi email này, hãy bỏ qua hoặc liên hệ bộ phận hỗ trợ của ${BRAND_NAME} trên website.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
