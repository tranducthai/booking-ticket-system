import { Fragment, type ReactNode } from "react";

/**
 * Tiny markdown subset for organizer-written text (event description,
 * terms, organizer bio): `# `/`## ` headings, `- `/`* ` bullet lists,
 * `**bold**`, blank line = new paragraph. Builds React elements — never
 * innerHTML — so organizer input can't inject markup.
 */
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let paragraph: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={blocks.length} className="list-disc space-y-1 pl-5">
        {list.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={blocks.length}>
        {paragraph.map((line, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {inline(line)}
          </Fragment>
        ))}
      </p>,
    );
    paragraph = [];
  };

  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushList();
      flushParagraph();
    } else if (heading) {
      flushList();
      flushParagraph();
      blocks.push(
        <h3 key={blocks.length} className="pt-2 text-base font-bold text-ink-800">
          {inline(heading[2])}
        </h3>,
      );
    } else if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushList();
  flushParagraph();

  return <div className={`space-y-3 text-sm leading-relaxed text-ink-600 ${className}`}>{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-ink-800">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
