import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Play, Loader2,
  LayoutDashboard, MessageSquareText, Sparkles,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useToast } from '../hooks/use-toast';
import { getDatasource, executeSql, type Datasource, type SqlExecuteResult } from '../api/datasources';
import {
  listPanels, createPanel, updatePanel, deletePanel, fetchPanelsData,
  type DashboardPanel, type PanelCreate, type ChartType, type PanelData, type PanelSuggestion,
} from '../api/panels';
import { CHART_THEMES, CHART_TYPE_LABELS, sqlToChartOption, sqlToScatterOption, renderTextPanel } from '../lib/chartBuilder';
import EChart from '../components/EChart';
import AIPanelModal from '../components/AIPanelModal';

const CHART_TYPES: ChartType[] = ['bar', 'pie', 'line', 'text', 'scatter', 'bar-stack'];

interface FormState {
  id: number | null;
  name: string;
  sql: string;
  chartType: ChartType;
  theme: string;
  refreshInterval: number;
}

const emptyForm: FormState = { id: null, name: '', sql: '', chartType: 'bar', theme: 'default', refreshInterval: 60 };

const REFRESH_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: '不自动刷新' },
  { value: 30, label: '每 30 秒' },
  { value: 60, label: '每 1 分钟' },
  { value: 300, label: '每 5 分钟' },
  { value: 900, label: '每 15 分钟' },
];

function PanelForm({
  dsId, initial, onSaved, onCancel,
}: {
  dsId: number;
  initial: FormState;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [preview, setPreview] = useState<SqlExecuteResult | null>(null);

  const runTest = async () => {
    if (!form.sql.trim()) return;
    setTesting(true);
    setPreview(null);
    try {
      const res = await executeSql(dsId, form.sql);
      setPreview(res);
      if (!res.ok && res.error) toast({ title: '查询失败', description: res.error, variant: 'destructive' });
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.sql.trim()) {
      toast({ title: '提示', description: '请填写名称和 SQL', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload: PanelCreate = {
        name: form.name.trim(), sql: form.sql.trim(), chartType: form.chartType, theme: form.theme,
        refreshInterval: form.refreshInterval,
      };
      if (form.id) {
        await updatePanel(dsId, form.id, payload);
      } else {
        await createPanel(dsId, payload);
      }
      toast({ title: '已保存' });
      onSaved();
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-primary" />
        <span className="font-semibold">{form.id ? '编辑面板' : '添加面板'}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label>名称</Label>
          <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：各部门销售额" />
        </div>
        <div className="space-y-1.5">
          <Label>图表类型</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            value={form.chartType}
            onChange={e => setForm({ ...form, chartType: e.target.value as ChartType })}
          >
            {CHART_TYPES.map(t => <option key={t} value={t}>{CHART_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>自动刷新</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            value={form.refreshInterval}
            onChange={e => setForm({ ...form, refreshInterval: Number(e.target.value) })}
          >
            {REFRESH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>主题</Label>
          <div className="flex items-center gap-2 pt-1">
            {Object.entries(CHART_THEMES).map(([key, t]) => (
              <button
                key={key}
                type="button"
                title={t.label}
                onClick={() => setForm({ ...form, theme: key })}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${form.theme === key ? 'border-primary' : 'border-transparent hover:border-muted'}`}
              >
                <span className="flex h-5 w-5 rounded-full" style={{ background: `linear-gradient(135deg, ${t.colors.slice(0, 3).join(', ')})` }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>SQL 查询</Label>
        <textarea
          value={form.sql}
          onChange={e => setForm({ ...form, sql: e.target.value })}
          rows={3}
          placeholder="SELECT category, SUM(amount) FROM payment GROUP BY category;"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={runTest} variant="outline" size="sm" disabled={testing || !form.sql.trim()}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
          测试查询
        </Button>
        <Button onClick={handleSave} size="sm" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}保存
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>取消</Button>
      </div>

      {preview && (
        <div className="border rounded-lg p-3 bg-slate-50/50">
          <div className="text-xs text-muted-foreground mb-2">预览（{preview.ok ? `${preview.count ?? 0} 行` : '失败'}）</div>
          {!preview.ok && preview.error ? (
            <div className="text-xs text-red-700 font-mono whitespace-pre-wrap">{preview.error}</div>
          ) : preview.columns && preview.columns.length > 0 ? (
            form.chartType === 'text' ? (
              renderTextPanel(preview.columns, preview.rows || [])
            ) : (
              (() => {
                const option = form.chartType === 'scatter'
                  ? sqlToScatterOption(preview.columns!, preview.rows || [], form.theme)
                  : sqlToChartOption(preview.columns!, preview.rows || [], form.chartType as any, form.theme);
                return option ? <EChart option={option} height={220} /> : <div className="text-sm text-muted-foreground">数据不适合绘制图表</div>;
              })()
            )
          ) : (
            <div className="text-sm text-muted-foreground">查询成功，无数据</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardConfigPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { toast } = useToast();
  const [ds, setDs] = useState<Datasource | null>(null);
  const [panels, setPanels] = useState<DashboardPanel[]>([]);
  const [dataMap, setDataMap] = useState<Record<number, PanelData>>({});
  const [form, setForm] = useState<FormState | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const dsId = Number(id);

  const load = useCallback(async () => {
    if (!dsId) return;
    try {
      const list = await listPanels(dsId);
      setPanels(list);
      if (list.length > 0) {
        const { panels: results } = await fetchPanelsData(dsId);
        const map: Record<number, PanelData> = {};
        for (const r of results) map[r.id] = r;
        setDataMap(map);
      } else {
        setDataMap({});
      }
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  }, [dsId, toast]);

  useEffect(() => {
    getDatasource(dsId).then(setDs).catch(() => {});
    load();
  }, [dsId, load]);

  const handleDelete = async (p: DashboardPanel) => {
    if (!confirm(`确认删除面板「${p.name}」？`)) return;
    try {
      await deletePanel(dsId, p.id);
      load();
      toast({ title: '已删除' });
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  };

  const move = async (p: DashboardPanel, dir: -1 | 1) => {
    const idx = panels.findIndex(x => x.id === p.id);
    const target = panels[idx + dir];
    if (!target) return;
    try {
      await updatePanel(dsId, p.id, { name: p.name, sql: p.sql, chartType: p.chartType, theme: p.theme, sortOrder: target.sortOrder });
      await updatePanel(dsId, target.id, { name: target.name, sql: target.sql, chartType: target.chartType, theme: target.theme, sortOrder: p.sortOrder });
      load();
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  };

  const handleAiConfirm = async (s: PanelSuggestion) => {
    const payload: PanelCreate = {
      name: s.name, sql: s.sql, chartType: s.chartType, theme: s.theme,
      refreshInterval: form?.refreshInterval ?? 60,
    };
    if (form?.id) {
      await updatePanel(dsId, form.id, payload);
    } else {
      await createPanel(dsId, payload);
    }
    toast({ title: form?.id ? '已更新' : '已生成' });
    setAiOpen(false);
    setForm(null);
    load();
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => nav(`/admin/datasources/${dsId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <LayoutDashboard className="h-5 w-5 text-primary" />
          <span className="text-xl font-medium">仪表盘配置</span>
          {ds && <span className="text-sm text-muted-foreground ml-1">· {ds.name}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/chat/${ds?.slug}/dashboard`} className="text-sm text-primary hover:underline">查看仪表盘</Link>
          <Button size="sm" variant="outline" onClick={() => setAiOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1 text-primary" /> AI 生成面板
          </Button>
          <Button size="sm" onClick={() => setForm({ ...emptyForm })} disabled={!!form}>
            <Plus className="h-4 w-4 mr-1" /> 添加面板
          </Button>
        </div>
      </div>

      {form && (
        <PanelForm
          dsId={dsId}
          initial={form}
          onCancel={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }}
        />
      )}

      {panels.length === 0 && !form ? (
        <div className="flex flex-col items-center justify-center bg-white rounded-lg border shadow-sm py-16 text-center space-y-3">
          <LayoutDashboard className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">还没有面板，点击右上角「添加面板」创建第一个图表</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {panels.map((p, idx) => (
            <div key={p.id} className="bg-white rounded-lg border shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
                <span className="text-sm font-medium truncate">{p.name}</span>
                <div className="flex items-center gap-0.5 shrink-0 ml-2">
                  <button onClick={() => move(p, -1)} disabled={idx === 0} title="上移" className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted disabled:opacity-30">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => move(p, 1)} disabled={idx === panels.length - 1} title="下移" className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted disabled:opacity-30">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setForm({ id: p.id, name: p.name, sql: p.sql, chartType: p.chartType, theme: p.theme, refreshInterval: p.refreshInterval })} title="编辑" className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(p)} title="删除" className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="p-2">
                {dataMap[p.id]?.error ? (
                  <div className="p-3 rounded bg-red-50 text-red-700 text-xs font-mono whitespace-pre-wrap">{dataMap[p.id].error}</div>
                ) : !dataMap[p.id]?.columns || dataMap[p.id].columns!.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">无数据</div>
                ) : p.chartType === 'text' ? (
                  renderTextPanel(dataMap[p.id]!.columns!, dataMap[p.id]!.rows || [])
                ) : (
                  (() => {
                    const d = dataMap[p.id]!;
                    const option = p.chartType === 'scatter'
                      ? sqlToScatterOption(d.columns!, d.rows || [], p.theme)
                      : sqlToChartOption(d.columns!, d.rows || [], p.chartType as any, p.theme);
                    return option ? <EChart option={option} height={180} /> : <div className="py-6 text-center text-sm text-muted-foreground">数据不适合绘制图表</div>;
                  })()
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AIPanelModal
        dsId={dsId}
        open={aiOpen}
        editId={form?.id ?? null}
        onClose={() => setAiOpen(false)}
        onConfirm={handleAiConfirm}
      />
    </div>
  );
}
