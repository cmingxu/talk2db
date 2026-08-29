import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowRight, MessageSquare, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';
import { getOrCreateNormalSession, getRecentSessions, type RecentSession } from '../api/sessions';
import { lookupDatasource, type Datasource } from '../api/datasources';

export default function NormalChatPage() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const { toast } = useToast();
  const [ds, setDs] = useState<Datasource | null>(null);
  const [dsError, setDsError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setDs(null);
    setDsError('');
    lookupDatasource(slug)
      .then(d => {
        if (cancelled) return;
        setDs(d);
        getRecentSessions()
          .then(list => { if (!cancelled) setRecentSessions(list.filter(s => s.datasourceId === d.id)); })
          .catch(() => {}); // silently ignore errors loading recent sessions
      })
      .catch(e => { if (!cancelled) setDsError(e.message); });
    return () => { cancelled = true; };
  }, [slug]);

  const handleStartChat = async () => {
    if (!ds || !message.trim()) return;
    setLoading(true);
    try {
      const { sessionId } = await getOrCreateNormalSession(ds.id);
      nav(`/chat/${slug}/session/${sessionId}?q=${encodeURIComponent(message)}`);
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStartChat();
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    return d.toLocaleDateString('zh-CN');
  };

  if (dsError) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] px-4 text-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
        <p className="text-muted-foreground">数据源不存在或已删除（{slug}）</p>
        <Link to="/admin/datasources" className="text-sm text-primary underline">
          前往管理后台查看数据源
        </Link>
      </div>
    );
  }

  if (!ds) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] px-4">
      {/* Branding */}
      <div className="text-center mb-10">
        <h1 className="text-3xl tracking-tight font-semibold gradient-text">
          {ds.chatTitle || ds.name}
        </h1>
        {ds.chatDesc && (
          <p className="mt-3 text-base text-muted-foreground max-w-2xl mx-auto">{ds.chatDesc}</p>
        )}
      </div>

      {/* Main chat input area */}
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl border shadow-lg overflow-hidden">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题，例如：本月新增用户有多少？"
            className="w-full h-36 px-6 pt-6 pb-4 text-base resize-none outline-none placeholder:text-muted-foreground/60"
            autoFocus
          />
          <div className="flex items-center justify-end px-4 pb-4">
            <Button
              onClick={handleStartChat}
              disabled={!message.trim() || loading}
              className="rounded-xl gap-2"
            >
              {loading ? '...' : '开始对话'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Recent conversations for this datasource */}
      {recentSessions.length > 0 && (
        <div className="w-full max-w-2xl mt-12">
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>最近对话</span>
          </div>
          <div className="space-y-2">
            {recentSessions.map(s => (
              <div
                key={s.id}
                onClick={() => nav(`/chat/${slug}/session/${s.id}`)}
                className="flex items-center justify-between bg-white rounded-xl border px-5 py-3.5 hover:bg-muted/30 cursor-pointer transition-colors shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <span className="text-sm font-medium block truncate">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.datasourceName}</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-3">{formatTime(s.updatedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
