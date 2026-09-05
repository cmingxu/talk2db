import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2, MessageSquare, Clock, Expand, Minimize } from 'lucide-react';
import { useSSE } from '../hooks/useSSE';
import { useToast } from '../hooks/use-toast';
import {
  getSession, getMessages, getOrCreateNormalSession, getRecentSessions,
  type Message as Msg, type RecentSession,
} from '../api/sessions';
import MessageBlock from './MessageBlock';
import ToolCallBlock from './ToolCallBlock';
import ToolResultBlock from './ToolResultBlock';
import EChartsBlock from './EChartsBlock';

interface ToolResultEntry {
  tool?: string;
  type?: string;
  config?: Record<string, unknown>;
  columns?: string[];
  rows?: string[][];
  count?: number;
  error?: string;
  filename?: string;
}

function renderHistoryToolResults(json: string) {
  try {
    const results: ToolResultEntry[] = JSON.parse(json);
    if (!Array.isArray(results)) return null;
    return results.map((tr, i) => (
      <div key={i} className="space-y-2">
        {tr.tool && tr.tool !== 'execute_sql' && <ToolCallBlock tool={tr.tool} arguments="" status="done" />}
        {tr.type === 'echart' && tr.config ? (
          <EChartsBlock config={tr.config} />
        ) : tr.type === 'table' && tr.columns ? (
          <ToolResultBlock columns={tr.columns} rows={tr.rows} count={tr.count} error={tr.error} filename={tr.filename} />
        ) : null}
      </div>
    ));
  } catch {
    return null;
  }
}

interface Props {
  datasourceId: number;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
}

export default function InlineChatPanel({ datasourceId, onToggleFullscreen, isFullscreen }: Props) {
  const { toast } = useToast();
  const { messages: sseMessages, isStreaming, error: sseError, start: startSSE } = useSSE();
  const [history, setHistory] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [recent, setRecent] = useState<RecentSession[]>([]);
  const [input, setInput] = useState('');
  const [streamContent, setStreamContent] = useState('');
  const [streamSteps, setStreamSteps] = useState<Array<{ tool: string; arguments: string; status: string; result?: any }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sseProcessedRef = useRef(0);
  const streamContentRef = useRef('');

  useEffect(() => {
    getRecentSessions()
      .then(list => setRecent(list.filter(s => s.datasourceId === datasourceId)))
      .catch(() => {});
  }, [datasourceId]);

  const openSession = useCallback(async (id: number) => {
    try {
      const s = await getSession(id);
      setSessionId(id);
      setSessionName(s.name);
      setHistory(await getMessages(id));
      setStreamSteps([]);
      setStreamContent('');
      sseProcessedRef.current = 0;
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  }, [toast]);

  // Process SSE messages (mirrors ChatPage logic, compact)
  const processSSE = useCallback(() => {
    const newMsgs = sseMessages.slice(sseProcessedRef.current);
    sseProcessedRef.current = sseMessages.length;
    for (const m of newMsgs) {
      switch (m.event) {
        case 'tool_call':
          setStreamSteps(prev => [...prev, { tool: m.data.tool, arguments: m.data.arguments, status: 'executing' }]);
          break;
        case 'tool_result':
          setStreamSteps(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last) {
              last.status = m.data.error ? 'error' : 'done';
              last.result = m.data;
            }
            return updated;
          });
          break;
        case 'text':
          setStreamContent(m.data.content || '');
          streamContentRef.current = m.data.content || '';
          break;
        case 'done': {
          const finalContent = streamContentRef.current;
          setStreamSteps(prev => {
            const toolResults: ToolResultEntry[] = [];
            const sqls: string[] = [];
            for (const step of prev) {
              if (step.tool === 'execute_sql') {
                try {
                  const args = JSON.parse(step.arguments);
                  if (args.query) sqls.push(args.query);
                } catch { /* ignore */ }
              }
              if (step.result) {
                toolResults.push({
                  tool: step.tool,
                  type: step.result.type,
                  config: step.result.config,
                  columns: step.result.columns,
                  rows: step.result.rows,
                  count: step.result.count,
                  error: step.result.error,
                  filename: step.result.filename,
                });
              }
            }
            const assistantMsg: Msg = {
              id: Date.now(),
              sessionId: sessionId ?? 0,
              role: 'assistant',
              content: finalContent,
              sql: sqls.length > 0 ? sqls.join(';\n') : undefined,
              toolResults: toolResults.length > 0 ? JSON.stringify(toolResults) : undefined,
              createdAt: new Date().toISOString(),
            };
            setHistory(prev => [...prev, assistantMsg]);
            return [];
          });
          setStreamContent('');
          streamContentRef.current = '';
          break;
        }
      }
    }
  }, [sseMessages, sessionId]);

  useEffect(() => { processSSE(); }, [processSSE]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, streamContent]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    let sid = sessionId;
    try {
      if (!sid) {
        const { sessionId: created } = await getOrCreateNormalSession(datasourceId);
        sid = created;
        setSessionId(created);
        setSessionName('新对话');
        setRecent(prev => prev.filter(s => s.id !== created));
      }
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
      return;
    }
    setStreamSteps([]);
    setStreamContent('');
    streamContentRef.current = '';
    sseProcessedRef.current = 0;
    setHistory(prev => [...prev, { id: Date.now(), sessionId: sid!, role: 'user', content: text, createdAt: new Date().toISOString() }]);
    startSSE(`/api/sessions/${sid}/chat`, { message: text });
  };

  const hasStreaming = isStreaming || streamSteps.length > 0 || streamContent;

  return (
    <div className="flex h-full flex-col bg-white border-l">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <MessageSquare className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold truncate">{sessionName || 'AI 对话'}</span>
        </div>
        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? '退出全屏' : '全屏'}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 p-3 bg-slate-50/60">
        {!sessionId && recent.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground px-1">
              <Clock className="h-3 w-3" /> 最近对话
            </div>
            {recent.map(s => (
              <button
                key={s.id}
                onClick={() => openSession(s.id)}
                className="w-full text-left bg-white rounded-lg border px-3 py-2 hover:bg-muted/40 transition-colors"
              >
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="text-xs text-muted-foreground truncate">{s.lastMessage || s.datasourceName}</div>
              </button>
            ))}
          </div>
        )}

        {history.map(msg => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-lg px-3 py-1.5 bg-primary text-primary-foreground text-sm whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {msg.sql && (
                  <ToolCallBlock tool="execute_sql" arguments={JSON.stringify({ query: msg.sql.split(';\n')[0] })} status="done" />
                )}
                {msg.toolResults && renderHistoryToolResults(msg.toolResults)}
                <MessageBlock content={msg.content} />
              </div>
            )}
          </div>
        ))}

        {/* Streaming */}
        {hasStreaming && (
          <div className="space-y-2">
            {streamSteps.map((step, i) => (
              <div key={i} className="space-y-2">
                <ToolCallBlock tool={step.tool} arguments={step.arguments} status={step.status as any} />
                {step.result && step.result.type === 'echart' && step.result.config ? (
                  <EChartsBlock config={step.result.config} />
                ) : step.result && step.result.columns ? (
                  <ToolResultBlock
                    columns={step.result.columns} rows={step.result.rows} count={step.result.count}
                    error={step.result.error} filename={step.result.filename}
                  />
                ) : null}
              </div>
            ))}
            {streamContent ? (
              <MessageBlock content={streamContent} />
            ) : (
              !streamSteps.length && (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> 思考中...
                </div>
              )
            )}
          </div>
        )}

        {sseError && (
          <div className="border border-red-200 bg-red-50/30 rounded-lg p-2 text-xs text-red-700">{sseError}</div>
        )}

        {!sessionId && recent.length === 0 && !hasStreaming && history.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-6">开始与数据对话</div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-2 shrink-0">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend(); }
          }}
          rows={2}
          placeholder="输入问题… (⌘/Ctrl+Enter 发送)"
          className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex justify-end mt-1.5">
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
