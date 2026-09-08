import { useEffect, useRef } from 'react';
import { Loader2, Send } from 'lucide-react';
import { ExcelAttachButton, AttachmentChip } from './ExcelAttachButton';
import type { ExcelAttachment } from '../lib/excel';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  attachments: ExcelAttachment[];
  onAttach: (attachment: ExcelAttachment) => void;
  onRemoveAttachment: (index: number) => void;
  isStreaming?: boolean;
  placeholder?: string;
}

/**
 * Modern AI-chat style input: a single rounded container holding an
 * auto-growing textarea, attachment chips, and a paperclip + circular send
 * button docked inside. Enter sends, Shift+Enter inserts a newline.
 */
export default function ChatInput({
  value,
  onChange,
  onSend,
  attachments,
  onAttach,
  onRemoveAttachment,
  isStreaming = false,
  placeholder = '输入问题… (Enter 发送，Shift+Enter 换行)',
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a max height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !isStreaming;

  return (
    <div className="rounded-2xl border border-input bg-background px-2 py-2 shadow-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
      {attachments.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5 px-1">
          {attachments.map((a, i) => (
            <AttachmentChip
              key={`${a.filename}-${i}`}
              attachment={a}
              onRemove={() => onRemoveAttachment(i)}
              disabled={isStreaming}
            />
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
        rows={1}
        placeholder={placeholder}
        className="block max-h-[200px] w-full resize-none overflow-y-auto border-0 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
      />

      <div className="flex items-center justify-between gap-1.5 px-1">
        <ExcelAttachButton
          onAttach={onAttach}
          disabled={isStreaming}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          title="发送"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
