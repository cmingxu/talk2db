import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Play, Square, Trash2, Loader2, Database } from 'lucide-react';
import { Button } from './ui/button';
import { executeSql, type SqlExecuteResult } from '../api/datasources';

interface SqlPlaygroundProps {
  datasourceId: number;
  datasourceName?: string;
  datasourceEngine?: string;
  initialSql?: string;
  onClose: () => void;
}

export default function SqlPlayground({ datasourceId, datasourceName, datasourceEngine, initialSql, onClose }: SqlPlaygroundProps) {
  const [sql, setSql] = useState(initialSql || '');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SqlExecuteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (initialSql) setSql(initialSql);
  }, [initialSql]);

  const handleRun = useCallback(async () => {
    if (!sql.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await executeSql(datasourceId, sql, controller.signal);
      if (!controller.signal.aborted) {
        setResult(res);
        if (!res.ok && res.error) setError(res.error);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e.message);
      }
    }

    if (!controller.signal.aborted) setRunning(false);
    abortRef.current = null;
  }, [sql, datasourceId]);

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
    abortRef.current = null;
  };

  const handleClear = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div className="flex flex-col h-full bg-background border-l">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">SQL 工作区</h3>
          {datasourceName && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded flex items-center gap-1">
              <Database className="h-3 w-3" />{datasourceName}{datasourceEngine ? ` (${datasourceEngine})` : ''}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* SQL Editor */}
      <div className="p-4 border-b space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleRun} disabled={running || !sql.trim()}>
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            运行
          </Button>
          <Button size="sm" variant="outline" onClick={handleStop} disabled={!running}>
            <Square className="h-4 w-4 mr-1" />
            停止
          </Button>
          <Button size="sm" variant="ghost" onClick={handleClear} disabled={!result && !error}>
            <Trash2 className="h-4 w-4 mr-1" />
            清空
          </Button>
        </div>
        <textarea
          className="w-full h-40 p-3 text-xs font-mono border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 bg-muted/30"
          value={sql}
          onChange={e => setSql(e.target.value)}
          placeholder="SELECT ..."
          spellCheck={false}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleRun();
            }
          }}
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-4">
        {running && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            执行中...
          </div>
        )}

        {error && (
          <div className="p-3 rounded bg-red-50 text-red-700 text-xs font-mono whitespace-pre-wrap">{error}</div>
        )}

        {result && result.ok && result.columns && result.rows && (
          <div>
            <div className="text-xs text-muted-foreground mb-2">
              返回 {result.count ?? result.rows.length} 行，{result.columns.length} 列
            </div>
            <div className="border rounded-md overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 border-b font-medium text-muted-foreground w-10">#</th>
                    {result.columns.map(col => (
                      <th key={col} className="text-left p-2 border-b font-medium whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/30 border-b last:border-b-0">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      {row.map((cell, j) => (
                        <td key={j} className="p-2 whitespace-nowrap max-w-xs truncate" title={cell}>
                          {cell === 'NULL' ? <span className="text-muted-foreground italic">NULL</span> : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!running && !error && !result && (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
            点击"运行"执行 SQL 查询
          </div>
        )}
      </div>
    </div>
  );
}
