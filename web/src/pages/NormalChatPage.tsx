import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, ArrowRight, MessageSquare, Clock } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';
import { getOrCreateNormalSession, getRecentSessions, type RecentSession } from '../api/sessions';
import { listDatasources, type Datasource } from '../api/datasources';

export default function NormalChatPage() {
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [selectedDsId, setSelectedDsId] = useState<number>(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const { toast } = useToast();
  const nav = useNavigate();

  useEffect(() => {
    listDatasources()
      .then(setDatasources)
      .catch(e => toast({ title: '错误', description: e.message, variant: 'destructive' }));
    getRecentSessions()
      .then(setRecentSessions)
      .catch(() => {}); // silently ignore errors loading recent sessions
  }, []);

  const handleStartChat = async () => {
    if (!selectedDsId || !message.trim()) return;
    setLoading(true);
    try {
      const { sessionId } = await getOrCreateNormalSession(selectedDsId);
      nav(`/chat/${sessionId}?q=${encodeURIComponent(message)}`);
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

  if (datasources.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="text-center space-y-4">
          <Database className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">没有可用的数据源</p>
          <p className="text-sm text-muted-foreground">请联系管理员为您分配数据源</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] px-4">
      {/* Branding */}
      <div className="text-center mb-10">
        <h1 className="text-3xl tracking-tight font-semibold gradient-text">
          Talk2DB · AI 驱动的 SQL 助手，用自然语言查询数据库
        </h1>
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
          <div className="flex items-center justify-between px-4 pb-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <select
                className="text-sm border-0 bg-muted/50 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20"
                value={selectedDsId}
                onChange={e => setSelectedDsId(Number(e.target.value))}
              >
                <option value={0}>选择数据源...</option>
                {datasources.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.engine})</option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleStartChat}
              disabled={!selectedDsId || !message.trim() || loading}
              className="rounded-xl gap-2"
            >
              {loading ? '...' : '开始对话'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Recent conversations */}
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
                onClick={() => nav(`/chat/${s.id}`)}
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
