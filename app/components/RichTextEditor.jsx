// app/components/RichTextEditor.jsx
//
// Tiptap-based rich text editor for email template bodies. Exposes its HTML
// via a hidden <input>, so it drops into an existing fetcher.Form/action pair
// that expects a `bodyHtml` form field without any changes to that action.
//
// Images and file links are inserted by URL (paste a link, no upload/storage
// involved) — kept intentionally simple since this app doesn't run its own
// file storage. Both are styled inline so they render the same way inside
// the editor as they will in the actual sent email.
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";

function escapeHtml(str) {
  return str.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

const IMAGE_STYLE =
  "max-width:100%;height:auto;display:block;margin:16px auto;border-radius:8px;";
const LINK_STYLE = "color:#1a73e8;text-decoration:underline;";

const TOOLBAR_BUTTON_STYLE = {
  border: "1px solid #c9cccf",
  background: "#fff",
  borderRadius: 4,
  padding: "4px 10px",
  fontSize: 13,
  cursor: "pointer",
};

const TOOLBAR_BUTTON_ACTIVE_STYLE = {
  ...TOOLBAR_BUTTON_STYLE,
  background: "#1a1a1a",
  color: "#fff",
  borderColor: "#1a1a1a",
};

export default function RichTextEditor({ name = "bodyHtml", defaultValue = "", tokens = [] }) {
  const hiddenInputRef = useRef(null);
  const [html, setHtml] = useState(defaultValue);

  const editor = useEditor({
    editorProps: {
      attributes: {
        // ProseMirror's contenteditable div gets a default browser focus
        // outline that hugs the text on click — kill it here since the
        // wrapper's own border/padding already frames the editor.
        style: "outline: none; border: none; box-shadow: none;",
      },
    },
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: false,
        HTMLAttributes: { style: LINK_STYLE },
      }),
      Image.configure({
        inline: false,
        HTMLAttributes: { style: IMAGE_STYLE },
      }),
    ],
    content: defaultValue,
    onUpdate: ({ editor: instance }) => {
      const next = instance.getHTML();
      setHtml(next);
      if (hiddenInputRef.current) hiddenInputRef.current.value = next;
    },
  });

  // Only resets content when `defaultValue` itself changes (e.g. "Reset to
  // default" or a fresh loader payload after Save) — not on every keystroke,
  // since typing lives inside Tiptap's own state, not this prop.
  useEffect(() => {
    if (!editor) return;
    if (defaultValue !== editor.getHTML()) {
      editor.commands.setContent(defaultValue || "", false);
      setHtml(defaultValue || "");
      if (hiddenInputRef.current) hiddenInputRef.current.value = defaultValue || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Link URL (leave blank to remove)", previousUrl || "https://");

    if (url === null) return; // cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }, [editor]);

  const insertToken = useCallback(
    (event) => {
      const value = event.target.value;
      event.target.value = "";
      if (!editor || !value) return;

      const descriptor = tokens.find(
        (token) => (typeof token === "string" ? token : token.value) === value,
      );
      const isLink = typeof descriptor === "object" && descriptor?.isLink;

      if (isLink) {
        const defaultLabel = typeof descriptor === "object" ? descriptor.label : "Click here";
        const label = window.prompt("Link text", defaultLabel)?.trim();
        if (!label) return;
        editor.chain().focus().insertContent(`<a href="${value}">${escapeHtml(label)}</a>&nbsp;`).run();
        return;
      }

      editor.chain().focus().insertContent(value).run();
    },
    [editor, tokens],
  );

  const insertImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Paste an image URL (e.g. a Shopify CDN link)");
    if (!url || !url.trim()) return;
    editor.chain().focus().setImage({ src: url.trim(), alt: "" }).run();
  }, [editor]);

  const insertFileLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Paste a file URL (PDF, doc, etc.)");
    if (!url || !url.trim()) return;

    const trimmedUrl = url.trim();
    const guessedName = trimmedUrl.split("/").pop()?.split("?")[0] || "Download";
    const label = window.prompt("Link text", guessedName)?.trim() || guessedName;

    editor
      .chain()
      .focus()
      .insertContent(
        `<a href="${trimmedUrl}" target="_blank" rel="noopener noreferrer">📎 ${escapeHtml(label)}</a>&nbsp;`,
      )
      .run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div style={{ border: "1px solid #c9cccf", borderRadius: 6, overflow: "hidden", padding: "10px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
          padding: 8,
          borderBottom: "1px solid #c9cccf",
          background: "#f6f6f7",
        }}
      >
        <button
          type="button"
          style={editor.isActive("bold") ? TOOLBAR_BUTTON_ACTIVE_STYLE : TOOLBAR_BUTTON_STYLE}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-pressed={editor.isActive("bold")}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          style={editor.isActive("italic") ? TOOLBAR_BUTTON_ACTIVE_STYLE : TOOLBAR_BUTTON_STYLE}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-pressed={editor.isActive("italic")}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          style={editor.isActive("bulletList") ? TOOLBAR_BUTTON_ACTIVE_STYLE : TOOLBAR_BUTTON_STYLE}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-pressed={editor.isActive("bulletList")}
        >
          • List
        </button>
        <button
          type="button"
          style={editor.isActive("orderedList") ? TOOLBAR_BUTTON_ACTIVE_STYLE : TOOLBAR_BUTTON_STYLE}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-pressed={editor.isActive("orderedList")}
        >
          1. List
        </button>
        <button
          type="button"
          style={editor.isActive("link") ? TOOLBAR_BUTTON_ACTIVE_STYLE : TOOLBAR_BUTTON_STYLE}
          onClick={setLink}
          aria-pressed={editor.isActive("link")}
        >
          Link
        </button>
        <button type="button" style={TOOLBAR_BUTTON_STYLE} onClick={insertImage}>
          🖼️ Insert image
        </button>
        <button type="button" style={TOOLBAR_BUTTON_STYLE} onClick={insertFileLink}>
          📎 Insert file link
        </button>

        {tokens.length > 0 ? (
          <select
            defaultValue=""
            onChange={insertToken}
            aria-label="Insert merge token"
            style={{ ...TOOLBAR_BUTTON_STYLE, cursor: "pointer" }}
          >
            <option value="" disabled>
              Insert token…
            </option>
            {tokens.map((token) => {
              const value = typeof token === "string" ? token : token.value;
              const label = typeof token === "string" ? token : token.label;
              return (
                <option key={value} value={value}>
                  {label}
                </option>
              );
            })}
          </select>
        ) : null}
      </div>

      <EditorContent
        editor={editor}
        style={{ padding: 20, minHeight: 160, maxHeight: 420, overflowY: "auto" }}
      />

      <input ref={hiddenInputRef} type="hidden" name={name} defaultValue={html} />
    </div>
  );
}
