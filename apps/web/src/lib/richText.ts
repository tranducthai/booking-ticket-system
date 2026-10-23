import DOMPurify from "dompurify";

/**
 * Event "Giới thiệu" is rich-text HTML (RichTextEditor). event-service
 * already sanitizes it before storing (common/rich-text-sanitizer.ts); this
 * is the same allow-list again at render time — defense in depth, and it
 * covers rows written before the server-side pass existed.
 */
const ALLOWED_TAGS = ["p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s", "span", "a", "ul", "ol", "li", "blockquote", "hr", "img"];
const ALLOWED_ATTR = ["href", "target", "rel", "src", "alt", "width", "height", "style"];
const ALLOWED_STYLES: Record<string, RegExp[]> = {
  color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/i],
  "font-size": [/^\d{1,2}(\.\d)?(px|em|rem)$/],
  "text-align": [/^(left|right|center|justify)$/],
};

let hooked = false;
function installHooks() {
  if (hooked) return;
  hooked = true;
  // DOMPurify keeps a `style` attribute wholesale — trim it to the properties the editor produces.
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName !== "style") return;
    const kept = data.attrValue
      .split(";")
      .map((decl) => decl.split(":").map((part) => part.trim()))
      .filter(([prop, value]) => prop && value && ALLOWED_STYLES[prop.toLowerCase()]?.some((re) => re.test(value)))
      .map(([prop, value]) => `${prop.toLowerCase()}: ${value}`);
    if (kept.length === 0) data.keepAttr = false;
    else data.attrValue = kept.join("; ");
  });
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });
}

export function sanitizeRichHtml(html: string): string {
  installHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // http(s)/mailto only — no javascript:, no data: images.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  });
}

/** Descriptions written before the rich-text editor were the markdown subset RichText renders. */
export function isRichHtml(text: string): boolean {
  return /^\s*</.test(text);
}

export function richTextToPlain(html: string): string {
  if (!isRichHtml(html)) return html;
  const doc = new DOMParser().parseFromString(sanitizeRichHtml(html), "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inlineMd = (s: string) => escape(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

/**
 * Old markdown-subset description -> HTML, so the editor opens it formatted
 * (`#`/`##` headings, `- `/`* ` bullets, `**bold**`, blank line = paragraph).
 */
export function legacyTextToHtml(text: string): string {
  if (!text.trim()) return "";
  if (isRichHtml(text)) return text;
  const out: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((li) => `<li><p>${inlineMd(li)}</p></li>`).join("")}</ul>`);
    if (para.length) out.push(`<p>${para.map(inlineMd).join("<br>")}</p>`);
    list = [];
    para = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (!line.trim()) flush();
    else if (heading) {
      flush();
      out.push(`<h${heading[1].length + 1}>${inlineMd(heading[2])}</h${heading[1].length + 1}>`);
    } else if (bullet) {
      if (para.length) flush();
      list.push(bullet[1]);
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return out.join("");
}
