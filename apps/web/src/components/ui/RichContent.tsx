import { useMemo } from "react";
import { isRichHtml, sanitizeRichHtml } from "../../lib/richText";
import { RichText } from "./RichText";

/**
 * Renders an event's "Giới thiệu": rich-text HTML from the editor
 * (sanitized again here — see lib/richText.ts), or the older markdown
 * subset via RichText for descriptions written before the editor.
 */
export function RichContent({ value, className = "" }: { value: string; className?: string }) {
  const html = useMemo(() => (isRichHtml(value) ? sanitizeRichHtml(value) : null), [value]);
  if (html === null) return <RichText text={value} className={className} />;
  // eslint-disable-next-line react/no-danger -- sanitized by sanitizeRichHtml (allow-listed tags, attributes, styles, URLs)
  return <div className={`rich-content ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
