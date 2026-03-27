"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import {
  Bold,
  Italic,
  UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Image as ImageIcon,
  Link as LinkIcon,
  Heading2,
  Minus,
  Loader2,
} from "lucide-react";
import { useRef } from "react";

type PostEditorProps = {
  content: string;
  onChange: (html: string) => void;
  onImageUpload?: (file: File) => Promise<string>;
};

export default function PostEditor({ content, onChange, onImageUpload }: PostEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      ImageExtension.configure({ inline: false }),
      LinkExtension.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "내용을 입력하세요..." }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content,
    onUpdate({ editor: e }) {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[240px] px-5 py-4 outline-none focus:outline-none",
      },
    },
    immediatelyRender: false,
  });

  if (!editor) return null;

  async function handleImageFile(file: File) {
    if (!onImageUpload) return;
    try {
      const url = await onImageUpload(file);
      editor?.chain().focus().setImage({ src: url }).run();
    } catch {
      // ignore
    }
  }

  function handleLinkInsert() {
    const url = prompt("링크 URL을 입력하세요");
    if (!url) return;
    editor?.chain().focus().setLink({ href: url }).run();
  }

  const toolbarBtn = (active: boolean, onClick: () => void, children: React.ReactNode, title?: string) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`cursor-pointer rounded-lg p-2 transition ${
        active
          ? "bg-indigo-100 text-indigo-700"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50 px-3 py-2">
        {toolbarBtn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 className="h-4 w-4" />, "제목")}
        <div className="mx-1 h-4 w-px bg-slate-200" />
        {toolbarBtn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold className="h-4 w-4" />, "굵게")}
        {toolbarBtn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic className="h-4 w-4" />, "기울기")}
        {toolbarBtn(editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon className="h-4 w-4" />, "밑줄")}
        {toolbarBtn(editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), <Strikethrough className="h-4 w-4" />, "취소선")}
        <div className="mx-1 h-4 w-px bg-slate-200" />
        {toolbarBtn(editor.isActive({ textAlign: "left" }), () => editor.chain().focus().setTextAlign("left").run(), <AlignLeft className="h-4 w-4" />, "왼쪽")}
        {toolbarBtn(editor.isActive({ textAlign: "center" }), () => editor.chain().focus().setTextAlign("center").run(), <AlignCenter className="h-4 w-4" />, "가운데")}
        {toolbarBtn(editor.isActive({ textAlign: "right" }), () => editor.chain().focus().setTextAlign("right").run(), <AlignRight className="h-4 w-4" />, "오른쪽")}
        <div className="mx-1 h-4 w-px bg-slate-200" />
        {toolbarBtn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List className="h-4 w-4" />, "목록")}
        {toolbarBtn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-4 w-4" />, "번호 목록")}
        {toolbarBtn(false, () => editor.chain().focus().setHorizontalRule().run(), <Minus className="h-4 w-4" />, "구분선")}
        <div className="mx-1 h-4 w-px bg-slate-200" />
        {toolbarBtn(editor.isActive("link"), handleLinkInsert, <LinkIcon className="h-4 w-4" />, "링크")}
        {onImageUpload && toolbarBtn(false, () => fileInputRef.current?.click(), <ImageIcon className="h-4 w-4" />, "이미지")}
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImageFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// Read-only rendered content
export function PostContent({ html }: { html: string }) {
  return (
    <div
      className="prose prose-sm max-w-none text-slate-700"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function UploadingOverlay() {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-500">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      이미지 업로드 중...
    </div>
  );
}
