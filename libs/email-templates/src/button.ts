import { escapeHtml } from "./escape-html";

/** Bulletproof-ish CTA link (a styled <a>, renders in every client incl. Outlook's fallback as a plain link). */
export function emailButton(href: string, label: string): string {
  return `<p style="margin:24px 0">
           <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#2dc275;color:#ffffff;font-weight:bold;text-decoration:none">${escapeHtml(label)}</a>
         </p>`;
}
