import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiErrorMessage } from "../../api/client";
import { mediaApi } from "../../api/media";
import { legacyTextToHtml } from "../../lib/richText";
import { useMediaConfig } from "./ImageField";

const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"];
const COLORS = ["#111827", "#6b7280", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777"];

/**
 * Rich-text editor for an event's "Giới thiệu" (TipTap): paragraph/heading
 * style, font size, text color, bold/italic/underline/strike, alignment,
 * lists, links, quote, divider and inline images (uploaded to Supabase
 * Storage like every other image). Emits HTML; event-service sanitizes it
 * before storing and the page sanitizes again when rendering.
 *
 * `value` is only read on mount (and legacy markdown is converted then) —
 * remount with a `key` to load different content.
 */
export function RichTextEditor({
  value,
  onChange,
  editable = true,
}: {
  value: string;
  onChange: (html: string) => void;
  editable?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" } },
      }),
      TextStyle,
      Color,
      FontSize,
      Image.configure({ inline: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: legacyTextToHtml(value),
    editable,
    editorProps: { attributes: { class: "rich-content min-h-[220px] px-4 py-3 focus:outline-none" } },
    // An empty editor still serializes to "<p></p>" — report that as "".
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;
  return (
    <div className={`overflow-hidden rounded-xl border border-ink-200 bg-white ${editable ? "focus-within:border-brand-500" : "opacity-70"}`}>
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "p",
      fontSize: (e.getAttributes("textStyle").fontSize as string | undefined) ?? "",
      color: (e.getAttributes("textStyle").color as string | undefined) ?? "",
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      justify: e.isActive({ textAlign: "justify" }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-ink-100 bg-ink-50 px-2 py-1.5">
      <select
        value={s.block}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") chain().setParagraph().run();
          else chain().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
        }}
        className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs"
        title="Kiểu đoạn"
      >
        <option value="p">Đoạn văn</option>
        <option value="h1">Tiêu đề lớn</option>
        <option value="h2">Tiêu đề</option>
        <option value="h3">Tiêu đề nhỏ</option>
      </select>
      <select
        value={s.fontSize}
        onChange={(e) => (e.target.value ? chain().setFontSize(e.target.value).run() : chain().unsetFontSize().run())}
        className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs"
        title="Cỡ chữ"
      >
        <option value="">Cỡ chữ</option>
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size.replace("px", "")}
          </option>
        ))}
      </select>

      <ColorPicker value={s.color} onPick={(c) => (c ? chain().setColor(c).run() : chain().unsetColor().run())} />
      <Sep />
      <Btn on={s.bold} title="Đậm (Ctrl+B)" onClick={() => chain().toggleBold().run()}>
        <b>B</b>
      </Btn>
      <Btn on={s.italic} title="Nghiêng (Ctrl+I)" onClick={() => chain().toggleItalic().run()}>
        <i className="font-serif">I</i>
      </Btn>
      <Btn on={s.underline} title="Gạch chân (Ctrl+U)" onClick={() => chain().toggleUnderline().run()}>
        <u>U</u>
      </Btn>
      <Btn on={s.strike} title="Gạch ngang" onClick={() => chain().toggleStrike().run()}>
        <s>S</s>
      </Btn>
      <Sep />
      <Btn on={s.left} title="Căn trái" onClick={() => chain().setTextAlign("left").run()}>
        <AlignIcon lines={[16, 10, 14]} />
      </Btn>
      <Btn on={s.center} title="Căn giữa" onClick={() => chain().setTextAlign("center").run()}>
        <AlignIcon lines={[16, 10, 14]} center />
      </Btn>
      <Btn on={s.right} title="Căn phải" onClick={() => chain().setTextAlign("right").run()}>
        <AlignIcon lines={[16, 10, 14]} right />
      </Btn>
      <Btn on={s.justify} title="Căn đều" onClick={() => chain().setTextAlign("justify").run()}>
        <AlignIcon lines={[16, 16, 16]} />
      </Btn>
      <Sep />
      <Btn on={s.bullet} title="Danh sách chấm" onClick={() => chain().toggleBulletList().run()}>
        •≡
      </Btn>
      <Btn on={s.ordered} title="Danh sách số" onClick={() => chain().toggleOrderedList().run()}>
        1≡
      </Btn>
      <Btn on={s.quote} title="Trích dẫn" onClick={() => chain().toggleBlockquote().run()}>
        ❝
      </Btn>
      <Btn title="Đường kẻ ngang" onClick={() => chain().setHorizontalRule().run()}>
        ―
      </Btn>
      <Sep />
      <Btn
        on={s.link}
        title="Chèn liên kết"
        onClick={() => {
          if (s.link) {
            chain().extendMarkRange("link").unsetLink().run();
            return;
          }
          const url = window.prompt("Địa chỉ liên kết (https://...)");
          if (url && /^https?:\/\//i.test(url.trim())) chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
        }}
      >
        🔗
      </Btn>
      <ImageButton editor={editor} />
      <Sep />
      <Btn title="Hoàn tác (Ctrl+Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        ↶
      </Btn>
      <Btn title="Làm lại (Ctrl+Y)" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        ↷
      </Btn>
    </div>
  );
}

function Btn({ on, title, onClick, disabled, children }: { on?: boolean; title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      // Keep the editor's selection: mousedown on a button would otherwise blur it first.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-sm transition-colors disabled:opacity-30 ${
        on ? "bg-brand-100 text-brand-700" : "text-ink-700 hover:bg-ink-200"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-5 w-px bg-ink-200" />;
}

function AlignIcon({ lines, center, right }: { lines: number[]; center?: boolean; right?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4">
      {lines.map((w, i) => {
        const x = center ? (20 - w) / 2 : right ? 18 - w : 2;
        return <rect key={i} x={x} y={4 + i * 5} width={w} height="1.8" rx="0.9" fill="currentColor" />;
      })}
    </svg>
  );
}

function ColorPicker({ value, onPick }: { value: string; onPick: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <Btn title="Màu chữ" onClick={() => setOpen((o) => !o)}>
        <span className="flex flex-col items-center leading-none">
          <span className="text-sm font-bold">A</span>
          <span className="mt-0.5 h-1 w-4 rounded-sm" style={{ background: value || "#111827" }} />
        </span>
      </Btn>
      {open && (
        <div className="absolute left-0 top-8 z-20 w-44 rounded-lg border border-ink-100 bg-white p-2 shadow-lg">
          <div className="grid grid-cols-5 gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
                className={`h-6 w-6 rounded-md ring-offset-1 ${value === c ? "ring-2 ring-brand-500" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="flex items-center gap-1 text-xs text-ink-600">
              Khác
              <input type="color" value={value || "#111827"} onChange={(e) => onPick(e.target.value)} className="h-6 w-8 cursor-pointer border-0 p-0" />
            </label>
            <button
              type="button"
              onClick={() => {
                onPick("");
                setOpen(false);
              }}
              className="text-xs font-semibold text-ink-500 hover:text-ink-800"
            >
              Mặc định
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageButton({ editor }: { editor: Editor }) {
  const input = useRef<HTMLInputElement>(null);
  const { data: cfg } = useMediaConfig();
  const [busy, setBusy] = useState(false);
  const enabled = cfg?.uploadEnabled ?? false;

  return (
    <>
      <Btn
        title={enabled ? "Chèn ảnh" : "Chưa thể tải ảnh lên — máy chủ chưa cấu hình nơi lưu ảnh"}
        disabled={!enabled || busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "…" : "🖼"}
      </Btn>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (cfg && file.size > cfg.maxBytes) {
            window.alert(`Ảnh tối đa ${Math.round(cfg.maxBytes / 1024 / 1024)}MB`);
            return;
          }
          setBusy(true);
          try {
            const src = await mediaApi.uploadImage(file, "content");
            editor.chain().focus().setImage({ src, alt: file.name.replace(/\.[^.]+$/, "") }).run();
          } catch (err) {
            window.alert(apiErrorMessage(err, "Tải ảnh lên thất bại"));
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
