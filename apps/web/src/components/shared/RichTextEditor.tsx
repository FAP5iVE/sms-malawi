'use client'

/**
 * apps/web/src/components/shared/RichTextEditor.tsx
 *
 * [CHANGE TYPE]: NEW FILE (first added 2026-09-14) — extended same day with
 *   a second, explicitly-scoped batch of formatting features.
 * [PURPOSE]: A formatting toolbar over Tiptap's headless editor, replacing
 *   the plain <textarea> AnnouncementForm.tsx used for the News article
 *   body. Tiptap chosen over a bespoke contentEditable/execCommand
 *   implementation because execCommand is deprecated/inconsistent across
 *   browsers; Tiptap is MIT-licensed, self-hosted (no API key, no paid
 *   tier, no external service call).
 *
 *   Feature set was deliberately filtered for a school news/events
 *   article editor, not a general-purpose document editor — see the
 *   in-chat conversation this was scoped from. Included: Bold, Italic,
 *   Underline, Strikethrough, Headings (H2-H4 — H1 is reserved for the
 *   article's own title field), Blockquote, bullet/numbered lists,
 *   Undo/Redo, a small fixed brand-color text palette, single-color
 *   Highlight, alignment, inline links, and inline images (insert +
 *   left/center/right alignment, no drag-resize handle). Deliberately
 *   left out: tables, code blocks/inline code, sub/superscript, YouTube
 *   embeds, task lists, font-family picker, bubble/slash menus, search &
 *   replace, math/LaTeX, invisible characters — each adds either real
 *   implementation/security complexity or has no real use case for a
 *   school's News/Events content.
 *
 *   Emits HTML via onChange — the server independently re-sanitizes on
 *   every save path (see server/lib/sanitizeRichText.ts) against an
 *   allowlist that matches exactly what this toolbar can produce; this
 *   component is a UX layer, not the security boundary.
 *
 *   value/onChange are a controlled HTML string, matching every other
 *   field in AnnouncementForm.tsx. A body with no HTML tags (every
 *   article written before this component existed) still renders
 *   correctly — Tiptap treats plain text as a single paragraph on load.
 * [DEPENDS ON]: @tiptap/react, @tiptap/starter-kit,
 *   @tiptap/extension-text-align, @tiptap/extension-highlight,
 *   @tiptap/extension-underline, @tiptap/extension-link,
 *   @tiptap/extension-image, @tiptap/extension-color,
 *   @tiptap/extension-text-style, @tiptap/extension-placeholder,
 *   lib/directUpload.ts's uploadFileDirectlyWithUrl()
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import BaseImage from '@tiptap/extension-image'
import Color from '@tiptap/extension-color'
import TextStyle from '@tiptap/extension-text-style'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Unlink,
  ImagePlus,
  Undo2,
  Redo2,
  Loader2,
} from 'lucide-react'
import { uploadFileDirectlyWithUrl } from '@/lib/directUpload'

// [NEW] Image with a fixed left/center/right alignment attribute, rendered
// as an inline style from a hard-coded, small value set (not an arbitrary
// drag-resize) — see sanitizeRichText.ts's matching allowedStyles regexes,
// which are the actual enforcement boundary for these exact strings.
const AlignableImage = BaseImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-align'),
        renderHTML: (attrs: { align?: string | null }) => {
          if (attrs.align === 'left') {
            return {
              'data-align': 'left',
              style:
                'float:left;display:block;margin-top:4px;margin-right:16px;margin-bottom:12px;margin-left:0;max-width:45%;',
            }
          }
          if (attrs.align === 'right') {
            return {
              'data-align': 'right',
              style:
                'float:right;display:block;margin-top:4px;margin-right:0;margin-bottom:12px;margin-left:16px;max-width:45%;',
            }
          }
          if (attrs.align === 'center') {
            return {
              'data-align': 'center',
              style:
                'display:block;margin-top:12px;margin-right:auto;margin-bottom:12px;margin-left:auto;max-width:100%;',
            }
          }
          return {}
        },
      },
    }
  },
})

// Small, brand-consistent palette — not an open color picker. Values match
// globals.css's light-mode --brand-* tokens. sanitizeRichText.ts allows
// exactly these hex values on a `color` style and nothing else.
const TEXT_COLORS = [
  { label: 'Navy', value: '#1e3a5f' },
  { label: 'Teal', value: '#0e8a6a' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Coral', value: '#dc4f3a' },
] as const

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  /** Roughly matches the old <textarea rows={n}> sizing so swapping this
   *  in doesn't change the form's overall height. */
  minHeightClassName?: string
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
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

function Toolbar({
  editor,
  onInsertImage,
  uploadingImage,
}: {
  editor: Editor | null
  onInsertImage: () => void
  uploadingImage: boolean
}) {
  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const colorMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!colorMenuOpen) return
    function onPointerDown(e: MouseEvent) {
      if (colorMenuRef.current && !colorMenuRef.current.contains(e.target as Node)) {
        setColorMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [colorMenuOpen])

  const setLink = useCallback(() => {
    if (!editor) return
    const previous = editor.getAttributes('link').href as string | undefined
    // [DECISION] window.prompt() rather than a custom modal — the simplest
    // option that doesn't add a whole dialog component for one text field.

    const url = window.prompt('Link URL', previous ?? 'https://')
    if (url === null) return // cancelled
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    const withScheme = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    editor.chain().focus().extendMarkRange('link').setLink({ href: withScheme }).run()
  }, [editor])

  if (!editor) return null

  const activeImage = editor.isActive('image')

  return (
    <div className="flex flex-wrap items-center gap-1 border border-base border-b-0 rounded-t-xl bg-page px-2 py-1.5">
      <ToolbarButton
        label="Undo"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo2 className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo2 className="w-3.5 h-3.5" />
      </ToolbarButton>

      <span className="w-px h-5 bg-base mx-1" aria-hidden />

      {/* Heading level — a <select> rather than a dropdown menu component,
          the lowest-complexity way to offer 4 mutually-exclusive options. */}
      <select
        aria-label="Text style"
        className="h-8 rounded-lg border border-transparent bg-transparent px-1.5 text-xs text-muted hover:bg-page focus:outline-none focus:ring-2 focus:ring-brand-teal/25 cursor-pointer"
        value={
          editor.isActive('heading', { level: 2 })
            ? '2'
            : editor.isActive('heading', { level: 3 })
              ? '3'
              : editor.isActive('heading', { level: 4 })
                ? '4'
                : '0'
        }
        onChange={(e) => {
          const level = Number(e.target.value)
          if (level === 0) editor.chain().focus().setParagraph().run()
          else
            editor
              .chain()
              .focus()
              .toggleHeading({ level: level as 2 | 3 | 4 })
              .run()
        }}
      >
        <option value="0">Normal text</option>
        <option value="2">Heading</option>
        <option value="3">Subheading</option>
        <option value="4">Small heading</option>
      </select>

      <span className="w-px h-5 bg-base mx-1" aria-hidden />

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
        label="Underline"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Highlight"
        active={editor.isActive('highlight')}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter className="w-3.5 h-3.5" />
      </ToolbarButton>

      {/* [NEW] Text color — fixed brand palette, not an open picker. */}
      <div className="relative" ref={colorMenuRef}>
        <ToolbarButton
          label="Text color"
          active={colorMenuOpen || !!editor.getAttributes('textStyle').color}
          onClick={() => setColorMenuOpen((o) => !o)}
        >
          <span
            className="text-[13px] font-bold leading-none"
            style={{ color: (editor.getAttributes('textStyle').color as string) || undefined }}
          >
            A
          </span>
        </ToolbarButton>
        {colorMenuOpen && (
          <div className="absolute z-10 top-9 left-0 flex items-center gap-1.5 p-1.5 rounded-xl border border-base bg-surface shadow-lg">
            <button
              type="button"
              title="Default"
              onClick={() => {
                editor.chain().focus().unsetColor().run()
                setColorMenuOpen(false)
              }}
              className="w-5 h-5 rounded-full border border-base bg-page"
            />
            {TEXT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => {
                  editor.chain().focus().setColor(c.value).run()
                  setColorMenuOpen(false)
                }}
                className="w-5 h-5 rounded-full border border-base"
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        )}
      </div>

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
      <ToolbarButton
        label="Quote"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="w-3.5 h-3.5" />
      </ToolbarButton>

      <span className="w-px h-5 bg-base mx-1" aria-hidden />

      <ToolbarButton label="Add link" active={editor.isActive('link')} onClick={setLink}>
        <LinkIcon className="w-3.5 h-3.5" />
      </ToolbarButton>
      {editor.isActive('link') && (
        <ToolbarButton label="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}>
          <Unlink className="w-3.5 h-3.5" />
        </ToolbarButton>
      )}
      <ToolbarButton label="Insert image" onClick={onInsertImage} disabled={uploadingImage}>
        {uploadingImage ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ImagePlus className="w-3.5 h-3.5" />
        )}
      </ToolbarButton>

      {activeImage && (
        <>
          <span className="w-px h-5 bg-base mx-1" aria-hidden />
          <span className="text-[11px] text-muted px-1">Image:</span>
          <ToolbarButton
            label="Align image left"
            active={editor.getAttributes('image').align === 'left'}
            onClick={() =>
              editor.chain().focus().updateAttributes('image', { align: 'left' }).run()
            }
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Align image center"
            active={editor.getAttributes('image').align === 'center'}
            onClick={() =>
              editor.chain().focus().updateAttributes('image', { align: 'center' }).run()
            }
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Align image right"
            active={editor.getAttributes('image').align === 'right'}
            onClick={() =>
              editor.chain().focus().updateAttributes('image', { align: 'right' }).run()
            }
          >
            <AlignRight className="w-3.5 h-3.5" />
          </ToolbarButton>
        </>
      )}
    </div>
  )
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeightClassName = 'min-h-[220px]',
}: RichTextEditorProps) {
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Explicitly dropped for this content type — see file header.
        code: false,
        codeBlock: false,
        heading: { levels: [2, 3, 4] },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
      Underline,
      TextStyle,
      Color,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      AlignableImage.configure({ inline: false }),
      Placeholder.configure({ placeholder: placeholder ?? 'Write the full article…' }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `w-full ${minHeightClassName} px-4 py-2.5 text-sm bg-page rounded-b-xl border border-base border-t-0 focus:outline-none focus:ring-2 focus:ring-brand-teal/25 prose prose-sm max-w-none [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_mark]:bg-amber-200/70 [&_mark]:rounded-sm [&_mark]:px-0.5 [&_blockquote]:border-l-4 [&_blockquote]:border-brand-teal/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted [&_a]:text-brand-teal [&_a]:underline [&_img]:rounded-lg [&_h2]:font-heading [&_h2]:font-bold [&_h2]:text-lg [&_h3]:font-heading [&_h3]:font-bold [&_h3]:text-base [&_h4]:font-heading [&_h4]:font-bold [&_h4]:text-sm [&_.is-editor-empty:first-child::before]:text-muted/60 [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:pointer-events-none`,
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

  const handleInsertImage = useCallback(() => {
    if (!editor) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      if (!file.type.startsWith('image/')) {
        setUploadError('Only image files are allowed.')
        return
      }
      setUploadError(null)
      setUploadingImage(true)
      try {
        // Reuses the same announcement-image upload route/permission the
        // cover-image field already used — no new backend endpoint needed,
        // and it's already in storage.ts's PUBLIC_FILE_PREFIXES so the
        // resulting URL loads for anonymous public-site visitors.
        const { url } = await uploadFileDirectlyWithUrl('/announcements/image/upload-ticket', file)
        editor.chain().focus().setImage({ src: url, alt: '' }).run()
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Failed to upload image.')
      } finally {
        setUploadingImage(false)
      }
    }
    input.click()
  }, [editor])

  return (
    <div className="relative">
      <Toolbar editor={editor} onInsertImage={handleInsertImage} uploadingImage={uploadingImage} />
      <EditorContent editor={editor} />
      {uploadError && <p className="text-xs text-destructive mt-1">{uploadError}</p>}
    </div>
  )
}
