import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Database, FileSpreadsheet } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';
import { useSSE } from '../hooks/useSSE';
import { getSession, getMessages, type Message as Msg } from '../api/sessions';
import { getDatasource, type Datasource } from '../api/datasources';

import MessageBlock from '../components/MessageBlock';
import SqlPlayground from '../components/SqlPlayground';
import ChatInput from '../components/ChatInput';
import AssistantToolBlocks from '../components/AssistantToolBlocks';
import StepBlock, { normalizeToolResult, indexSqlSteps, type StreamStep, type ToolResultEntry } from '../components/StepBlock';
import { type ExcelAttachment } from '../lib/excel';

interface HistoryMsg extends Msg {
  steps?: StreamStep[];
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { toast } = useToast();
  // ChatPage is used from the admin session list only (/admin/sessions/:id/chat).
  const isAdmin = true;
  const backTo = '/admin/sessions';
  const { messages: sseMessages, isStreaming, error: sseError, start: startSSE } = useSSE();
  const [history, setHistory] = useState<HistoryMsg[]>([]);
  const [ds, setDs] = useState<Datasource | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ExcelAttachment[]>([]);
  const [streamSteps, setStreamSteps] = useState<StreamStep[]>([]);
  const [streamContent, setStreamContent] = useState('');
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [playgroundSql, setPlaygroundSql] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const autoSentRef = useRef(false);
  const sseProcessedRef = useRef(0);
  const streamContentRef = useRef('');
  const streamStepsRef = useRef<StreamStep[]>([]);

  useEffect(() => {
    if (!id) return;
    getSession(Number(id)).then(async s => {
      setSessionName(s.name);
      const d = await getDatasource(s.datasourceId);
      setDs(d);
      const msgs = await getMessages(Number(id));
      setHistory(msgs);
    }).catch(e => toast({ title: 'Error', description: e.message, variant: 'destructive' }));
  }, [id]);

  // Auto-send message from query parameter (e.g. /chat/1?q=hello)
  useEffect(() => {
    const q = searchParams.get('q');
    if (!q || !id || autoSentRef.current || isStreaming) return;
    autoSentRef.current = true;
    // Short delay so session/datasource data has time to load
    const timer = setTimeout(() => {
      streamStepsRef.current = [];
      setStreamSteps([]);
      setStreamContent('');
      streamContentRef.current = '';
      sseProcessedRef.current = 0;
      setHistory(prev => [...prev, { id: 0, sessionId: Number(id), role: 'user', content: q, createdAt: new Date().toISOString() }]);
      startSSE(`/api/sessions/${id}/chat`, { message: q });
    }, 500);
    return () => clearTimeout(timer);
  }, [searchParams, id, isStreaming, startSSE]);

  const processSSE = useCallback(() => {
    const newMsgs = sseMessages.slice(sseProcessedRef.current);
    sseProcessedRef.current = sseMessages.length;
    for (const m of newMsgs) {
      switch (m.event) {
        case 'tool_call': {
          const step: StreamStep = { tool: m.data.tool, arguments: m.data.arguments, status: 'executing' };
          streamStepsRef.current = [...streamStepsRef.current, step];
          setStreamSteps(streamStepsRef.current);
          break;
        }
        case 'tool_result': {
          const result = normalizeToolResult(m.data);
          streamStepsRef.current = streamStepsRef.current.map((s, i) =>
            i === streamStepsRef.current.length - 1
              ? { ...s, status: (result.error ? 'error' : 'done') as StreamStep['status'], result }
              : s,
          );
          setStreamSteps(streamStepsRef.current);
          break;
        }
        case 'text':
          setStreamContent(m.data.content || '');
          streamContentRef.current = m.data.content || '';
          break;
        case 'done': {
          const finalContent = streamContentRef.current;
          const steps = streamStepsRef.current;
          const sqls: string[] = [];
          const toolResults: ToolResultEntry[] = [];
          for (const step of steps) {
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
          const assistantMsg: HistoryMsg = {
            id: Date.now(),
            sessionId: Number(id),
            role: 'assistant',
            content: finalContent,
            sql: sqls.length > 0 ? sqls.join(';\n') : undefined,
            toolResults: toolResults.length > 0 ? JSON.stringify(toolResults) : undefined,
            steps,
            createdAt: new Date().toISOString(),
          };
          setHistory(prev => [...prev, assistantMsg]);
          streamStepsRef.current = [];
          setStreamSteps([]);
          setStreamContent('');
          streamContentRef.current = '';
          break;
        }
      }
    }
  }, [sseMessages, id]);

  useEffect(() => { processSSE(); }, [processSSE]);

  // Auto-scroll only for new messages and text content, not tool blocks
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history, streamContent]);

  const handleSend = () => {
    if (!input.trim() || isStreaming || !id) return;
    const text = input.trim();
    const atts = attachments;
    const fileNames = atts.map(a => a.filename);
    streamStepsRef.current = [];
    setStreamSteps([]);
    setStreamContent('');
    streamContentRef.current = '';
    sseProcessedRef.current = 0;
    setHistory(prev => [...prev, { id: 0, sessionId: Number(id), role: 'user', content: text, attachments: fileNames, createdAt: new Date().toISOString() }]);
    const body = atts.length > 0 ? { message: text, attachments: atts } : { message: text };
    startSSE(`/api/sessions/${id}/chat`, body);
    setInput('');
    setAttachments([]);
  };

  const handleOpenPlayground = useCallback((sql: string) => {
    setPlaygroundSql(sql);
    setPlaygroundOpen(true);
  }, []);

  const hasStreaming = isStreaming || streamSteps.length > 0 || streamContent;

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      <div className={`flex flex-col ${playgroundOpen ? 'w-1/2 pr-2 border-r' : isAdmin ? 'w-full' : 'w-full max-w-3xl mx-auto'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => nav(backTo)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold">{sessionName || 'Chat'}</h2>
            {ds && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded flex items-center gap-1">
                <Database className="h-3 w-3" />{ds.name} ({ds.engine})
              </span>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 bg-white rounded-lg border p-4 mb-4 shadow-sm">
          {/* History messages */}
          {history.map((msg) => (
            <div key={msg.id}>
              {msg.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-lg px-4 py-2 bg-primary text-primary-foreground">
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {msg.attachments.map((name, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded bg-white/20 px-1.5 py-0.5 text-[11px]">
                            <FileSpreadsheet className="h-3 w-3" />
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs opacity-70 mt-1">
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {msg.steps && msg.steps.length > 0 ? (
                    indexSqlSteps(msg.steps).map((step, i) => (
                      <StepBlock key={i} step={step} onExecuteSql={isAdmin ? handleOpenPlayground : undefined} />
                    ))
                  ) : (
                    <AssistantToolBlocks
                      sql={msg.sql}
                      toolResults={msg.toolResults}
                      onExecuteSql={isAdmin ? handleOpenPlayground : undefined}
                    />
                  )}
                  <MessageBlock content={msg.content} />
                  <div className="text-xs text-muted-foreground">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Streaming display */}
          {hasStreaming && (
            <div className="space-y-3">
              {/* Tool calls and results during streaming */}
              {indexSqlSteps(streamSteps).map((step, i) => (
                <StepBlock
                  key={i}
                  step={step}
                  onExecuteSql={isAdmin ? handleOpenPlayground : undefined}
                />
              ))}
              {streamContent ? (
                <MessageBlock content={streamContent} />
              ) : (
                isStreaming && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {streamSteps.some(s => s.status === 'executing') ? '执行中...' : '思考中...'}
                  </div>
                )
              )}
            </div>
          )}

          {sseError && (
            <div className="border border-red-200 bg-red-50/30 rounded-lg p-3">
              <p className="text-sm text-red-700">{sseError}</p>
            </div>
          )}
        </div>

        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          attachments={attachments}
          onAttach={a => setAttachments(prev => [...prev, a])}
          onRemoveAttachment={i => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
          isStreaming={isStreaming}
          placeholder="输入你的问题... (Enter 发送，Shift+Enter 换行)"
        />

      </div>
      {playgroundOpen && ds && (
        <div className="w-1/2 pl-2">
          <SqlPlayground
            datasourceId={ds.id}
            datasourceName={ds.name}
            datasourceEngine={ds.engine}
            initialSql={playgroundSql}
            onClose={() => setPlaygroundOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
