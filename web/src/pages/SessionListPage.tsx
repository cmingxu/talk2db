import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MessageSquare, Trash2, Edit3 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useToast } from '../hooks/use-toast';
import { listSessions, createSession, deleteSession, updateSession, type Session } from '../api/sessions';
import { listDatasources, type Datasource } from '../api/datasources';

export default function SessionListPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [dsId, setDsId] = useState<number>(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const { toast } = useToast();
  const nav = useNavigate();

  const load = async () => {
    try {
      const [ss, ds] = await Promise.all([listSessions(), listDatasources()]);
      setSessions(ss);
      setDatasources(ds);
      if (ds.length > 0 && dsId === 0) setDsId(ds[0].id);
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try {
      const s = await createSession(name, dsId);
      setShowForm(false);
      setName('');
      load();
      nav(`/sessions/${s.id}/chat`);
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除此会话？')) return;
    try { await deleteSession(id); load(); } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  };

  const handleRename = async (id: number) => {
    try { await updateSession(id, editName); setEditingId(null); load(); } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  };

  const getDsName = (dsId: number) => datasources.find(d => d.id === dsId)?.name ?? '未知';

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 text-xl font-medium">
          <MessageSquare className="h-5 w-5" />
          会话
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm" disabled={datasources.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> 新建
        </Button>
      </div>

      {datasources.length === 0 && (
        <div className="bg-yellow-50 p-4 rounded-lg text-sm text-yellow-700">
          创建会话前需要先添加数据源。<a href="/datasources" className="underline font-medium">点此添加</a>
        </div>
      )}

      {showForm && (
        <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4 max-w-md">
          <h3 className="font-semibold">新建会话</h3>
          <div className="space-y-2">
            <label className="text-sm font-medium">名称</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="我的分析" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">数据源</label>
            <select className="w-full border rounded-md p-2 text-sm bg-background" value={dsId} onChange={e => setDsId(Number(e.target.value))}>
              {datasources.map(d => <option key={d.id} value={d.id}>{d.name} ({d.engine})</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={!name.trim()}>创建</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {sessions.map(s => (
          <div key={s.id} className="bg-white p-4 rounded-lg border shadow-sm flex items-center justify-between hover:bg-muted/30 cursor-pointer" onClick={() => nav(`/sessions/${s.id}/chat`)}>
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                {editingId === s.id ? (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 w-48" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleRename(s.id); if (e.key === 'Escape') setEditingId(null); }} />
                    <Button size="sm" onClick={() => handleRename(s.id)}>保存</Button>
                  </div>
                ) : (
                  <div className="font-medium">{s.name}</div>
                )}
                <div className="text-xs text-muted-foreground">{getDsName(s.datasourceId)} &middot; {new Date(s.updatedAt).toLocaleDateString()}</div>
              </div>
            </div>
            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
              <Button size="sm" variant="ghost" onClick={() => { setEditingId(s.id); setEditName(s.name); }}><Edit3 className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
            </div>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="text-center text-muted-foreground py-10">暂无会话，创建一个以开始与数据对话。</div>
        )}
      </div>
    </div>
  );
}
