import { useRef } from 'react';
import { Paperclip, X, FileSpreadsheet } from 'lucide-react';
import { parseExcelFile, validateAttachment, type ExcelAttachment } from '../lib/excel';
import { useToast } from '../hooks/use-toast';

interface ButtonProps {
  onAttach: (a: ExcelAttachment) => void;
  disabled?: boolean;
  className?: string;
}

/** Paperclip button that parses an Excel/CSV file and validates it before attaching. */
export function ExcelAttachButton({ onAttach, disabled, className }: ButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const file of files) {
      try {
        const att = await parseExcelFile(file);
        const err = validateAttachment(att);
        if (err) {
          toast({ title: '无法上传', description: `${file.name}: ${err}`, variant: 'destructive' });
          continue;
        }
        onAttach(att);
      } catch (err: any) {
        toast({ title: '解析失败', description: `${file.name}: ${err?.message || '无法解析该文件'}`, variant: 'destructive' });
      }
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.tsv"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      <button
        type="button"
        title="上传 Excel（最多 2000 行）"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className={className ?? "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50"}
      >
        <Paperclip className="h-4 w-4" />
      </button>
    </>
  );
}

interface ChipProps {
  attachment: ExcelAttachment;
  onRemove: () => void;
  disabled?: boolean;
}

/** Removable chip showing the attached file name and dimensions. */
export function AttachmentChip({ attachment, onRemove, disabled }: ChipProps) {
  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs">
      <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{attachment.filename}</span>
      <span className="shrink-0 text-muted-foreground">
        {attachment.rows.length} 行 × {attachment.headers.length} 列
      </span>
      <button
        type="button"
        title="移除附件"
        onClick={onRemove}
        disabled={disabled}
        className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
