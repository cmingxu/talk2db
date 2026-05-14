import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Loader2, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useToast } from '../hooks/use-toast';
import {
  getDatasource, updateDatasource, testConnection,
  listTableSpaces, listTables, addTableSpaces, removeTableSpace,
  type Datasource, type TableSpace
} from '../api/datasources';

export default function DatasourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { toast } = useToast();
  const [ds, setDs] = useState<Datasource | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ host: '', port: 0, username: '', password: '', databaseName: '' });
  const [testResult, setTestResult] = useState<{ ok?: boolean; error?: string; tables?: string[] } | null>(null);
  const [testing, setTesting] = useState(false);
  const [tableSpaces, setTableSpaces] = useState<TableSpace[]>([]);
  const [allTables, setAllTables] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [loadingTables, setLoadingTables] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const d = await getDatasource(Number(id));
      setDs(d);
      setForm({ host: d.host, port: d.port, username: d.username, password: '', databaseName: d.databaseName });
      const ts = await listTableSpaces(Number(id));
      setTableSpaces(ts);
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  };
  useEffect(() => { load(); }, [id]);

  const handleTest = async () => {
    if (!id) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection(Number(id));
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
    }
    setTesting(false);
  };

  const handleFetchTables = async () => {
    if (!id) return;
    setLoadingTables(true);
    try {
      const res = await listTables(Number(id));
      setAllTables(res.tables);
      setSelectedTables(new Set(tableSpaces.map(t => t.tableName)));
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
    setLoadingTables(false);
  };

  const handleSaveTables = async () => {
    if (!id) return;
    try {
      const toAdd = Array.from(selectedTables).filter(t => !tableSpaces.find(ts => ts.tableName === t));
      if (toAdd.length > 0) await addTableSpaces(Number(id), toAdd);
      await load();
      toast({ title: '成功', description: '表空间已更新。' });
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  };

  const handleRemoveTable = async (tsId: number) => {
    if (!id) return;
    try { await removeTableSpace(Number(id), tsId); load(); } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!id || !ds) return;
    try {
      await updateDatasource(Number(id), { ...ds, ...form });
      setEdit(false);
      load();
      toast({ title: '已保存' });
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  };

  if (!ds) return <div className="p-6">加载中...</div>;

  return (
    <div className="space-y-6 pb-10">
      <Button variant="ghost" size="sm" onClick={() => nav('/datasources')}>
        <ArrowLeft className="h-4 w-4 mr-1" /> 返回
      </Button>

      <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4 max-w-3xl">
        <h2 className="text-xl font-semibold flex items-center gap-2">{ds.name} <span className="text-xs uppercase bg-muted px-2 py-0.5 rounded">{ds.engine}</span></h2>

        <div className="grid grid-cols-2 gap-4">
          <div><Label>主机</Label><Input value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} disabled={!edit} /></div>
          <div><Label>端口</Label><Input type="number" value={form.port} onChange={e => setForm({ ...form, port: Number(e.target.value) })} disabled={!edit} /></div>
          <div><Label>用户名</Label><Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} disabled={!edit} /></div>
          <div><Label>密码</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} disabled={!edit} placeholder={edit ? '' : '（未更改）'} /></div>
          <div><Label>数据库</Label><Input value={form.databaseName} onChange={e => setForm({ ...form, databaseName: e.target.value })} disabled={!edit} /></div>
        </div>

        <div className="flex gap-2">
          {!edit ? (
            <Button onClick={() => setEdit(true)} variant="outline" size="sm">编辑</Button>
          ) : (
            <>
              <Button onClick={handleSave} size="sm">保存</Button>
              <Button onClick={() => setEdit(false)} variant="outline" size="sm">取消</Button>
            </>
          )}
          <Button onClick={handleTest} variant="outline" size="sm" disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} 测试连接
          </Button>
        </div>

        {testResult && (
          <div className={`p-3 rounded ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult.ok ? (
              <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4" /> 连接成功。发现 {testResult.tables?.length ?? 0} 张表。</div>
            ) : (
              <div className="flex items-center gap-2"><XCircle className="h-4 w-4" /> {testResult.error}</div>
            )}
          </div>
        )}
      </div>

      {/* Table Space */}
      <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4 max-w-3xl">
        <h3 className="text-lg font-semibold">表空间</h3>
        <p className="text-sm text-muted-foreground">选择要包含在 LLM 提示中的表。这些是 AI 可以查询的表。</p>

        <div className="flex gap-2">
          <Button onClick={handleFetchTables} variant="outline" size="sm" disabled={loadingTables}>
            {loadingTables ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            获取表
          </Button>
          {(allTables?.length ?? 0) > 0 && (
            <Button
              variant="outline" size="sm"
              onClick={() => {
                if (selectedTables.size === allTables.length) {
                  setSelectedTables(new Set());
                } else {
                  setSelectedTables(new Set(allTables));
                }
              }}
            >
              {selectedTables.size === allTables.length ? '取消全选' : '全选'}
            </Button>
          )}
          <Button onClick={handleSaveTables} size="sm" disabled={(allTables?.length ?? 0) === 0}>保存选择</Button>
        </div>

        {(allTables?.length ?? 0) > 0 && (
          <div className="border rounded-md max-h-64 overflow-y-auto">
            {allTables.map(t => (
              <label key={t} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 cursor-pointer border-b last:border-b-0">
                <input type="checkbox" checked={selectedTables.has(t)} onChange={() => {
                  const next = new Set(selectedTables);
                  next.has(t) ? next.delete(t) : next.add(t);
                  setSelectedTables(next);
                }} />
                <span className="text-sm">{t}</span>
              </label>
            ))}
          </div>
        )}

        {tableSpaces.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground">当前表空间（{tableSpaces.length} 张表）</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {tableSpaces.map(ts => (
                <span key={ts.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-xs">
                  {ts.tableName}
                  <button onClick={() => handleRemoveTable(ts.id)} className="hover:text-red-500">&times;</button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
