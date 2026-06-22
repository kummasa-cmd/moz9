"use client";

import { useCallback, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import TipTapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, List, ListOrdered,
  Heading2, Heading3, ImageIcon,
  Minus, Quote, Undo, Redo,
} from "lucide-react";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const IMAGE_SIZES = ["100%", "80%", "50%", "30%"] as const;

// Image extension with width attribute for resize support
const CustomImage = TipTapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attrs) =>
          attrs.width
            ? { style: `width: ${attrs.width}; max-width: 100%; display: block;` }
            : { style: "max-width: 100%; display: block;" },
        parseHTML: (el) => el.style.width || null,
      },
    };
  },
});

function Btn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-primary text-white"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

type RichEditorProps = {
  name: string;
  defaultValue?: string;
};

export default function RichEditor({ name, defaultValue = "" }: RichEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [html, setHtml] = useState(defaultValue);
  const [selectedImageWidth, setSelectedImageWidth] = useState<string | null>(null);

  const uploadAndInsert = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드 가능합니다.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert("이미지 크기는 5MB 이하여야 합니다.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/board-image", { method: "POST", body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert((data as { error?: string }).error ?? "이미지 업로드에 실패했습니다.");
      return;
    }
    const { url } = (await res.json()) as { url: string };
    editorRef.current?.chain().focus().setImage({ src: url }).run();
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      CustomImage.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: "내용을 입력하세요" }),
    ],
    content: defaultValue,
    onUpdate: ({ editor: e }) => setHtml(e.getHTML()),
    onSelectionUpdate: ({ editor: e }) => {
      const { selection } = e.state;
      if (
        selection instanceof NodeSelection &&
        selection.node.type.name === "image"
      ) {
        setSelectedImageWidth((selection.node.attrs.width as string | null) ?? "100%");
      } else {
        setSelectedImageWidth(null);
      }
    },
    editorProps: {
      handlePaste(_, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) uploadAndInsert(file);
            return true;
          }
        }
        return false;
      },
      handleDrop(_, event) {
        const files = Array.from(event.dataTransfer?.files ?? []);
        const img = files.find((f) => f.type.startsWith("image/"));
        if (img) {
          event.preventDefault();
          uploadAndInsert(img);
          return true;
        }
        return false;
      },
    },
  });

  editorRef.current = editor;

  if (!editor) return null;

  const applyImageSize = (size: string) => {
    editor.chain().focus().updateAttributes("image", { width: size }).run();
    setSelectedImageWidth(size);
  };

  return (
    <div className="rounded-lg border border-input overflow-hidden">
      <input type="hidden" name={name} value={html} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadAndInsert(file);
          e.target.value = "";
        }}
      />

      {/* Main toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/40 px-2 py-1.5">
        <Btn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="굵게"
        >
          <Bold size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="기울임"
        >
          <Italic size={14} />
        </Btn>
        <div className="w-px h-4 bg-border mx-1" />
        <Btn
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="제목 2"
        >
          <Heading2 size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="제목 3"
        >
          <Heading3 size={14} />
        </Btn>
        <div className="w-px h-4 bg-border mx-1" />
        <Btn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="목록"
        >
          <List size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="번호 목록"
        >
          <ListOrdered size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="인용"
        >
          <Quote size={14} />
        </Btn>
        <div className="w-px h-4 bg-border mx-1" />
        <Btn onClick={() => fileInputRef.current?.click()} title="이미지 삽입 (최대 5MB)">
          <ImageIcon size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="구분선"
        >
          <Minus size={14} />
        </Btn>
        <div className="w-px h-4 bg-border mx-1" />
        <Btn onClick={() => editor.chain().focus().undo().run()} title="실행 취소">
          <Undo size={14} />
        </Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} title="다시 실행">
          <Redo size={14} />
        </Btn>

        {/* Image size picker — visible only when an image is selected */}
        {selectedImageWidth !== null && (
          <>
            <div className="w-px h-4 bg-border mx-1" />
            <span className="text-xs text-muted-foreground px-1">이미지 크기:</span>
            {IMAGE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => applyImageSize(size)}
                title={`이미지 너비 ${size}`}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  selectedImageWidth === size
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {size}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Editor area */}
      <div className="rich-editor-content px-4 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
