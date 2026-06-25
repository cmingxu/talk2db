import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Send, Loader2, Database } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useToast } from '../hooks/use-toast';
import { useAuth } from '../hooks/useAuth';
import { useSSE } from '../hooks/useSSE';
import { getSession, getMessages, type Message as Msg } from '../api/sessions';
import { getDatasource, type Datasource } from '../api/datasources';

import ToolCallBlock from '../components/ToolCallBlock';
import MessageBlock from '../components/MessageBlock';
import ToolResultBlock from '../components/ToolResultBlock';
import EChartsBlock from '../components/EChartsBlock';
import SqlPlayground from '../components/SqlPlayground';

interface ToolStep {
  toolCall: { tool: string; arguments: string };
  status: 'executing' | 'done' | 'error';
  toolResult?: {
    columns?: string[];
    rows?: string[][];
    count?: number;
    error?: string;
    type?: string;
    config?: Record<string, unknown>;
  };
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { toast } = useToast();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { messages: sseMessages, isStreaming, error: sseError, start: startSSE } = useSSE();
  const [history, setHistory] = useState<Msg[]>([]);
  const [ds, setDs] = useState<Datasource | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [input, setInput] = useState('');
  const [streamSteps, setStreamSteps] = useState<ToolStep[]>([]);
  const [streamContent, setStreamContent] = useState('');
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [playgroundSql, setPlaygroundSql] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const autoSentRef = useRef(false);

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
      setStreamSteps([]);
      setStreamContent('');
      setHistory(prev => [...prev, { id: 0, sessionId: Number(id), role: 'user', content: q, createdAt: new Date().toISOString() }]);
      startSSE(`/api/sessions/${id}/chat`, { message: q });
    }, 500);
    return () => clearTimeout(timer);
  }, [searchParams, id, isStreaming, startSSE]);

  const processSSE = useCallback(() => {
    for (const m of sseMessages) {
      switch (m.event) {


        case 'tool_call':
          setStreamSteps(prev => [...prev, {
            toolCall: { tool: m.data.tool, arguments: m.data.arguments },
            status: 'executing',
          }]);
          break;
        case 'tool_result':
          setStreamSteps(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last) {
              last.status = m.data.error ? 'error' : 'done';
              last.toolResult = {
                columns: m.data.columns,
                rows: m.data.rows,
                count: m.data.count,
                error: m.data.error,
                type: m.data.type,
                config: m.data.config,
              };
            }
            return updated;
          });
          break;
        case 'text':
          setStreamContent(m.data.content || '');
          break;
        case 'done':
          setStreamSteps([]);
          setStreamContent('');
          if (id) getMessages(Number(id)).then(setHistory).catch(() => {});
          break;
      }
    }
  }, [sseMessages, id]);

  useEffect(() => { processSSE(); }, [processSSE]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history, streamSteps, streamContent]);

  const handleSend = () => {
    if (!input.trim() || isStreaming || !id) return;
    setStreamSteps([]);
    setStreamContent('');
    setHistory(prev => [...prev, { id: 0, sessionId: Number(id), role: 'user', content: input, createdAt: new Date().toISOString() }]);
    startSSE(`/api/sessions/${id}/chat`, { message: input });
    setInput('');
  };

  const handleOpenPlayground = useCallback((sql: string) => {
    setPlaygroundSql(sql);
    setPlaygroundOpen(true);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const hasStreaming = isStreaming || streamSteps.length > 0 || streamContent;

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      <div className={`flex flex-col ${playgroundOpen ? 'w-1/2 pr-2 border-r' : isAdmin ? 'w-full' : 'w-full max-w-3xl mx-auto'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => nav(isAdmin ? '/sessions' : '/chat')}>
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
          {history.map(msg => (
            <div key={msg.id}>
              {msg.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-lg px-4 py-2 bg-primary text-primary-foreground">
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <div className="text-xs opacity-70 mt-1">
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {msg.sql && (
                    <ToolCallBlock
                      tool="execute_sql"
                      arguments={JSON.stringify({ query: msg.sql.split(';\n')[0] })}
                      status="done"
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
              {streamSteps.map((step, i) => (
                <div key={i} className="space-y-2">
                  <ToolCallBlock
                    tool={step.toolCall.tool}
                    arguments={step.toolCall.arguments}
                    status={step.status}
                    onExecuteSql={
                      isAdmin && step.toolCall.tool === 'execute_sql'
                        ? () => {
                            try {
                              const parsed = JSON.parse(step.toolCall.arguments);
                              if (parsed.query) handleOpenPlayground(parsed.query);
                            } catch {
                              handleOpenPlayground(step.toolCall.arguments);
                            }
                          }
                        : undefined
                    }
                  />
                  {step.toolResult && (
                    step.toolResult.type === 'echart' && step.toolResult.config ? (
                      <EChartsBlock config={step.toolResult.config} />
                    ) : (
                      <ToolResultBlock
                        columns={step.toolResult.columns}
                        rows={step.toolResult.rows}
                        count={step.toolResult.count}
                        error={step.toolResult.error}
                      />
                    )
                  )}
                </div>
              ))}
              {streamContent ? (
                <MessageBlock content={streamContent} />
              ) : (
                !streamSteps.length && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>思考中...</span>
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

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题..."
            disabled={isStreaming}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={isStreaming || !input.trim()}>
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

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
