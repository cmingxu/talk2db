import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Clock, Expand, Minimize, FileSpreadsheet } from 'lucide-react';
import { useSSE } from '../hooks/useSSE';
import { useToast } from '../hooks/use-toast';
import {
  getSession, getMessages, getOrCreateNormalSession, getRecentSessions,
  type Message as Msg, type RecentSession,
} from '../api/sessions';
import MessageBlock from './MessageBlock';
import ChatInput from './ChatInput';
import AssistantToolBlocks from './AssistantToolBlocks';
import StepBlock, { normalizeToolResult, indexSqlSteps, type StreamStep, type ToolResultEntry } from './StepBlock';
import { type ExcelAttachment } from '../lib/excel';

interface HistoryMsg extends Msg {
  steps?: StreamStep[];
}

interface Props {
  datasourceId: number;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
}

export default function InlineChatPanel({ datasourceId, onToggleFullscreen, isFullscreen }: Props) {
  const { toast } = useToast();
  const { messages: sseMessages, isStreaming, error: sseError, start: startSSE } = useSSE();
  const [history, setHistory] = useState<HistoryMsg[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [recent, setRecent] = useState<RecentSession[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ExcelAttachment[]>([]);
  const [streamContent, setStreamContent] = useState('');
  const [streamSteps, setStreamSteps] = useState<StreamStep[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sseProcessedRef = useRef(0);
  const streamContentRef = useRef('');
  const streamStepsRef = useRef<StreamStep[]>([]);

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
      streamStepsRef.current = [];
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
            sessionId: sessionId ?? 0,
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
  }, [sseMessages, sessionId]);

  useEffect(() => { processSSE(); }, [processSSE]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, streamContent]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    const atts = attachments;
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
    setInput('');
    setAttachments([]);
    const fileNames = atts.map(a => a.filename);
    streamStepsRef.current = [];
    setStreamSteps([]);
    setStreamContent('');
    streamContentRef.current = '';
    sseProcessedRef.current = 0;
    setHistory(prev => [...prev, { id: Date.now(), sessionId: sid!, role: 'user', content: text, attachments: fileNames, createdAt: new Date().toISOString() }]);
    const body = atts.length > 0 ? { message: text, attachments: atts } : { message: text };
    startSSE(`/api/sessions/${sid}/chat`, body);
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
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {msg.steps && msg.steps.length > 0 ? (
                  indexSqlSteps(msg.steps).map((step, i) => <StepBlock key={i} step={step} />)
                ) : (
                  <AssistantToolBlocks sql={msg.sql} toolResults={msg.toolResults} />
                )}
                <MessageBlock content={msg.content} />
              </div>
            )}
          </div>
        ))}

        {/* Streaming */}
        {hasStreaming && (
          <div className="space-y-2">
            {indexSqlSteps(streamSteps).map((step, i) => (
              <StepBlock key={i} step={step} />
            ))}
            {streamContent ? (
              <MessageBlock content={streamContent} />
            ) : (
              isStreaming && (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {streamSteps.some(s => s.status === 'executing') ? '执行中...' : '思考中...'}
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
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          attachments={attachments}
          onAttach={a => setAttachments(prev => [...prev, a])}
          onRemoveAttachment={i => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
          isStreaming={isStreaming}
          placeholder="输入问题… (Enter 发送，Shift+Enter 换行)"
        />
      </div>
    </div>
  );
}
