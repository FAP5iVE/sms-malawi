'use client'

/**
 * apps/web/src/components/shared/RichTextEditor.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: A small formatting toolbar (Bold, Italic, alignment, bullet/
 *   numbered list, highlight) over Tiptap's headless editor, replacing the
 *   plain <textarea> AnnouncementForm.tsx previously used for the News
 *   article body. Chosen over a bespoke contentEditable/execCommand
 *   implementation because execCommand is deprecated/inconsistent across
 *   browsers; Tiptap is MIT-licensed, self-hosted (no API key, no paid
 *   tier, no external service call), and already fits this project's
 *   React 19 / Next 16 stack.
 *
 *   Emits sanitized-on-the-server HTML (see server/lib/sanitize.ts) via
 *   onChange — the server independently re-sanitizes on save, so this is
 *   a defense-in-depth / UX layer, not the only guard against a malicious
 *   payload bypassing the client.
 *
 *   value/onChange are a controlled HTML string, matching every other
 *   field in AnnouncementForm.tsx. A body with no HTML tags (every
 *   article written before this change) still renders correctly — Tiptap
 *   treats plain text as a single paragraph on load.
 * [DEPENDS ON]: @tiptap/react, @tiptap/starter-kit,
 *   @tiptap/extension-text-align, @tiptap/extension-highlight
 */

import { useEffect } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import {
  Bold, Italic, List, ListOrdered, Highlighter,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
} from 'lucide-react'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  /** Roughly matches the old <textarea rows={n}> sizing so swapping this
   *  in doesn't change the form's overall height. */
  minHeightClassName?: string
}

function ToolbarButton({
  onClick, active, disabled, label, children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? 'bg-brand-teal/15 border-brand-teal text-brand-teal'
          : 'border-transparent text-muted hover:bg-page hover:text-body'
      }`}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null
  return (
    <div className="flex flex-wrap items-center gap-1 border border-base border-b-0 rounded-t-xl bg-page px-2 py-1.5">
      <ToolbarButton
        label="Bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Highlight"
        active={editor.isActive('highlight')}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter className="w-3.5 h-3.5" />
      </ToolbarButton>

      <span className="w-px h-5 bg-base mx-1" aria-hidden />

      <ToolbarButton
        label="Align left"
        active={editor.isActive({ textAlign: 'left' })}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      >
        <AlignLeft className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Align center"
        active={editor.isActive({ textAlign: 'center' })}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      >
        <AlignCenter className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Align right"
        active={editor.isActive({ textAlign: 'right' })}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      >
        <AlignRight className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Justify"
        active={editor.isActive({ textAlign: 'justify' })}
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
      >
        <AlignJustify className="w-3.5 h-3.5" />
      </ToolbarButton>

      <span className="w-px h-5 bg-base mx-1" aria-hidden />

      <ToolbarButton
        label="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="w-3.5 h-3.5" />
      </ToolbarButton>
    </div>
  )
}

export function RichTextEditor({
  value, onChange, placeholder, minHeightClassName = 'min-h-[220px]',
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `w-full ${minHeightClassName} px-4 py-2.5 text-sm bg-page rounded-b-xl border border-base border-t-0 focus:outline-none focus:ring-2 focus:ring-brand-teal/25 prose prose-sm max-w-none [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_mark]:bg-amber-200/70 [&_mark]:rounded-sm [&_mark]:px-0.5`,
        'data-placeholder': placeholder ?? '',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  })

  // Keep the editor in sync when `value` is reset from outside (e.g. the
  // form clearing after submit, or a draft finishing its async load) —
  // Tiptap is uncontrolled internally, so this only pushes an update when
  // the two have actually diverged, avoiding a cursor-jumping loop on
  // every keystroke.
  useEffect(() => {
    if (!editor) return
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync on external value changes, not on every editor identity change
  }, [value])

  return (
    <div className="relative">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      {editor?.isEmpty && placeholder && (
        <p className="pointer-events-none absolute left-4 top-13 text-sm text-muted/60">{placeholder}</p>
      )}
    </div>
  )
}
