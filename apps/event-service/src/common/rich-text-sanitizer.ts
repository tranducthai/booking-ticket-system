import sanitizeHtml from "sanitize-html";

/**
 * Allow-list for an event's "Giới thiệu" HTML, written by organizers in the
 * web's rich-text editor (apps/web/src/components/ui/RichTextEditor.tsx) and
 * shown to every visitor — so it's cleaned here, before it's stored, no
 * matter who calls the API (the editor isn't the only possible client).
 * apps/web re-sanitizes with the same allow-list at render time for rows
 * written before this existed.
 *
 * Formatting only: headings, paragraphs, lists, bold/italic/underline/strike,
 * links, images, quotes, rules, and inline text color / font size /
 * alignment. No scripts, event handlers, iframes, forms, classes, or
 * data:/javascript: URLs (an image must be an http(s) URL — uploads go to
 * Supabase Storage, so there's no reason for megabytes of base64 here).
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s", "span", "a", "ul", "ol", "li", "blockquote", "hr", "img"],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height"],
    "*": ["style"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/i],
      "font-size": [/^\d{1,2}(\.\d)?(px|em|rem)$/],
      "text-align": [/^(left|right|center|justify)$/],
    },
  },
  // Links leave the site in a new tab without handing it window.opener.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
  },
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/** Plain text of a rich-text field — for search/recommendation tokenizing, where tags are noise. */
export function richTextToPlain(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}
