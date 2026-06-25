import { useState } from 'react';
import { Wrench, Check, Copy, Loader2, Play, ChevronDown } from 'lucide-react';

interface Props {
  tool: string;
  arguments: string;
  status: 'executing' | 'done' | 'error';
  onExecuteSql?: (sql: string) => void;
}

export default function ToolCallBlock({ tool, arguments: args, status, onExecuteSql }: Props) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(args);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  let sql = '';
  try {
    const parsed = JSON.parse(args);
    sql = parsed.query || '';
  } catch {
    sql = args;
  }

  return (
    <div className="border border-blue-200 bg-blue-50/30 rounded-lg overflow-hidden">
      <button
        className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-blue-50/50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <ChevronDown className={`h-3 w-3 text-blue-500 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        <Wrench className="h-3.5 w-3.5 text-blue-600" />
        <span className="text-xs font-medium text-blue-700">{tool}</span>
        {status === 'executing' && <Loader2 className="h-3 w-3 animate-spin text-blue-500 ml-auto" />}
        {status === 'done' && <Check className="h-3 w-3 text-green-500 ml-auto" />}
      </button>
      {!collapsed && sql && (
        <div className="px-3 pb-3">
          <div className="relative group">
            <pre className="bg-slate-950 text-slate-50 rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
              {sql}
            </pre>
            <button
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-slate-400 hover:text-slate-200" />
              )}
            </button>
          </div>
          {onExecuteSql && (
            <button
              onClick={() => onExecuteSql(sql)}
              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
            >
              <Play className="h-3 w-3" />
              执行此 SQL
            </button>
          )}
        </div>
      )}
    </div>
  );
}
