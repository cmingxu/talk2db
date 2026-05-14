import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Database, Trash2, Edit3 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useToast } from '../hooks/use-toast';
import { listDatasources, createDatasource, deleteDatasource, type Datasource, type DatasourceCreate } from '../api/datasources';

const ENGINES = ['mysql', 'oracle', 'postgres'];

export default function DatasourceListPage() {
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DatasourceCreate>({ name: '', engine: 'mysql', host: '', port: 3306, username: '', password: '', databaseName: '' });
  const { toast } = useToast();
  const nav = useNavigate();

  const load = () => { listDatasources().then(setDatasources).catch(e => toast({ title: '错误', description: e.message, variant: 'destructive' })); };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try {
      await createDatasource(form);
      setShowForm(false);
      setForm({ name: '', engine: 'mysql', host: '', port: 3306, username: '', password: '', databaseName: '' });
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

  const defaultPort = (engine: string) => engine === 'mysql' ? 3306 : engine === 'oracle' ? 1521 : 5432;

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
          <div className="flex gap-2">
            <Button onClick={handleCreate}>保存</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left p-3 font-medium">名称</th>
              <th className="text-left p-3 font-medium">引擎</th>
              <th className="text-left p-3 font-medium">主机:端口</th>
              <th className="text-left p-3 font-medium">数据库</th>
              <th className="text-right p-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {datasources.map(ds => (
              <tr key={ds.id} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer" onClick={() => nav(`/datasources/${ds.id}`)}>
                <td className="p-3 font-medium">{ds.name}</td>
                <td className="p-3 uppercase text-xs">{ds.engine}</td>
                <td className="p-3 text-muted-foreground">{ds.host}:{ds.port}</td>
                <td className="p-3 text-muted-foreground">{ds.databaseName}</td>
                <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); nav(`/datasources/${ds.id}`); }}><Edit3 className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(ds.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </td>
              </tr>
            ))}
            {datasources.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">暂无数据源，添加一个以开始使用。</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
