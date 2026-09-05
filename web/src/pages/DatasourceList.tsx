import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Database, Trash2, Edit3, MessageSquareText, LayoutDashboard, Server } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useToast } from '../hooks/use-toast';
import { listDatasources, createDatasource, deleteDatasource, type Datasource, type DatasourceCreate } from '../api/datasources';
import { listPanels } from '../api/panels';

const ENGINES = ['mysql', 'oracle', 'postgres', 'dameng'];

export default function DatasourceListPage() {
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [panelCounts, setPanelCounts] = useState<Record<number, number>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DatasourceCreate>({ name: '', slug: '', engine: 'mysql', host: '', port: 3306, username: '', password: '', databaseName: '', chatTitle: '', chatDesc: '' });
  const { toast } = useToast();
  const nav = useNavigate();

  const load = () => {
    listDatasources()
      .then(async (list) => {
        setDatasources(list);
        const counts: Record<number, number> = {};
        await Promise.all(list.map(async ds => {
          try { counts[ds.id] = (await listPanels(ds.id)).length; } catch { counts[ds.id] = 0; }
        }));
        setPanelCounts(counts);
      })
      .catch(e => toast({ title: '错误', description: e.message, variant: 'destructive' }));
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try {
      await createDatasource(form);
      setShowForm(false);
      setForm({ name: '', slug: '', engine: 'mysql', host: '', port: 3306, username: '', password: '', databaseName: '', chatTitle: '', chatDesc: '' });
      load();
      toast({ title: '已创建', description: '数据源添加成功。' });
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除此数据源？')) return;
    try { await deleteDatasource(id); load(); toast({ title: '已删除' }); }
    catch (e: any) { toast({ title: '错误', description: e.message, variant: 'destructive' }); }
  };

  const defaultPort = (engine: string) => engine === 'mysql' ? 3306 : engine === 'oracle' ? 1521 : engine === 'dameng' ? 5236 : 5432;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 text-xl font-medium">
          <Database className="h-5 w-5" />
          数据源
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> 添加
        </Button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4 max-w-2xl">
          <h3 className="font-semibold">新建数据源</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="生产数据库" />
            </div>
            <div className="space-y-2">
              <Label>引擎</Label>
              <select className="w-full border rounded-md p-2 text-sm bg-background" value={form.engine} onChange={e => setForm({ ...form, engine: e.target.value, port: defaultPort(e.target.value) })}>
                {ENGINES.map(e => <option key={e} value={e}>{e.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>主机</Label>
              <Input value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} placeholder="localhost" />
            </div>
            <div className="space-y-2">
              <Label>端口</Label>
              <Input type="number" value={form.port} onChange={e => setForm({ ...form, port: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>用户名</Label>
              <Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>密码</Label>
              <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>数据库</Label>
              <Input value={form.databaseName} onChange={e => setForm({ ...form, databaseName: e.target.value })} placeholder="mydb" />
            </div>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">聊天页设置</span>
              <span className="text-xs text-muted-foreground">显示在数据源聊天页顶部，留空则使用默认值</span>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>聊天页访问路径 (slug)</Label>
                <Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="如 sakila-movies，留空根据名称自动生成" />
              </div>
              <div className="space-y-2">
                <Label>聊天页标题</Label>
                <Input value={form.chatTitle} onChange={e => setForm({ ...form, chatTitle: e.target.value })} placeholder="默认使用数据源名称" />
              </div>
              <div className="space-y-2">
                <Label>聊天页描述</Label>
                <textarea
                  value={form.chatDesc}
                  onChange={e => setForm({ ...form, chatDesc: e.target.value })}
                  rows={2}
                  placeholder="例如：本数据源为 Sakila 示例电影数据库，包含 1000 部电影等数据。"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate}>保存</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {datasources.map(ds => (
          <div key={ds.id} className="bg-white rounded-lg border shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            {/* Card header */}
            <div className="flex items-start justify-between gap-2 px-5 pt-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Database className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{ds.chatTitle || ds.name}</div>
                  <div className="text-xs text-muted-foreground">{ds.name}</div>
                </div>
              </div>
              <span className="shrink-0 text-[10px] uppercase bg-muted px-2 py-0.5 rounded">{ds.engine}</span>
            </div>

            {/* Connection info */}
            <div className="px-5 pt-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Server className="h-3.5 w-3.5" />
                {ds.host}:{ds.port} · {ds.databaseName}
              </div>
              <div className="text-xs text-muted-foreground font-mono">/chat/{ds.slug}</div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 px-4 py-3 mt-3 border-t bg-muted/10">
              <Link
                to={`/chat/${ds.slug}/dashboard`}
                target="_blank"
                rel="noopener noreferrer"
                title="打开仪表盘"
                className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                仪表盘
                <span className="text-muted-foreground">{panelCounts[ds.id] ?? 0}</span>
              </Link>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => nav(`/admin/datasources/${ds.id}`)}
                  title="编辑"
                  className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(ds.id)}
                  title="删除"
                  className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {datasources.length === 0 && (
          <div className="col-span-full bg-white rounded-lg border shadow-sm py-16 text-center text-muted-foreground">
            暂无数据源，点击右上角「添加」创建一个。
          </div>
        )}
      </div>
    </div>
  );
}
