import { useEffect, useState } from 'react';
import { Sparkles, Loader2, X, Wand2, RefreshCw, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { executeSql, type SqlExecuteResult } from '../api/datasources';
import { generatePanel, type ChartType, type PanelSuggestion } from '../api/panels';
import { CHART_THEMES, CHART_TYPE_LABELS, sqlToChartOption, sqlToScatterOption, renderTextPanel } from '../lib/chartBuilder';
import EChart from './EChart';

const CHART_TYPES: ChartType[] = ['bar', 'pie', 'line', 'text', 'scatter', 'bar-stack'];

interface Props {
  dsId: number;
  open: boolean;
  /** Existing panel id when regenerating an edit, else null (creates new). */
  editId: number | null;
  onClose: () => void;
  onConfirm: (s: PanelSuggestion) => Promise<void>;
}

export default function AIPanelModal({ dsId, open, editId, onClose, onConfirm }: Props) {
  const [step, setStep] = useState<'input' | 'result'>('input');
  const [request, setRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState<PanelSuggestion | null>(null);
  const [preview, setPreview] = useState<SqlExecuteResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('input');
      setRequest('');
      setLoading(false);
      setError('');
      setSuggestion(null);
      setPreview(null);
      setConfirming(false);
    }
  }, [open]);

  if (!open) return null;

  const runGenerate = async () => {
    if (!request.trim()) return;
    setLoading(true);
    setError('');
    try {
      const s = await generatePanel(dsId, request.trim());
      setSuggestion(s);
      setStep('result');
      runPreview(s);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const runPreview = async (s: PanelSuggestion = suggestion!) => {
    if (!s?.sql.trim()) return;
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await executeSql(dsId, s.sql);
      setPreview(res);
      if (!res.ok && res.error) setError(res.error);
      else setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!suggestion) return;
    setConfirming(true);
    setError('');
    try {
      await onConfirm({ ...suggestion, name: suggestion.name.trim() || 'AI 面板' });
    } catch (e: any) {
      setError(e.message);
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-semibold">AI 生成面板</span>
            {step === 'result' && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">第 2 步 / 共 2 步</span>
            )}
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {step === 'input' ? (
            <>
              {/* Step 1: describe the request */}
              <div className="space-y-1.5">
                <Label>你想在面板上展示什么？</Label>
                <textarea
                  value={request}
                  onChange={e => setRequest(e.target.value)}
                  rows={4}
                  placeholder="例如：展示每个电影分类的影片数量，用柱状图；再比如：统计各分级的影片占比用饼图…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  AI 会根据数据源的表结构自动生成 SQL、图表类型和主题
                </p>
              </div>

              {error && <div className="p-3 rounded bg-red-50 text-red-700 text-xs whitespace-pre-wrap">{error}</div>}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
                <Button size="sm" onClick={runGenerate} disabled={!request.trim() || loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wand2 className="h-4 w-4 mr-1" />}
                  生成
                </Button>
              </div>
            </>
          ) : (
            suggestion && (
              <>
                {/* Step 2: review the AI result */}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                  AI 已根据需求生成以下面板，你可以修改后预览，确认后生成。
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>面板名称</Label>
                    <Input value={suggestion.name} onChange={e => setSuggestion({ ...suggestion, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>图表类型</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
                      value={suggestion.chartType}
                      onChange={e => {
                        const next = { ...suggestion, chartType: e.target.value as ChartType };
                        setSuggestion(next);
                        setPreview(null);
                      }}
                    >
                      {CHART_TYPES.map(t => <option key={t} value={t}>{CHART_TYPE_LABELS[t]}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>SQL</Label>
                  <textarea
                    value={suggestion.sql}
                    onChange={e => { setSuggestion({ ...suggestion, sql: e.target.value }); setPreview(null); }}
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>主题</Label>
                  <div className="flex items-center gap-2">
                    {Object.entries(CHART_THEMES).map(([key, t]) => (
                      <button
                        key={key}
                        type="button"
                        title={t.label}
                        onClick={() => setSuggestion({ ...suggestion, theme: key })}
                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${suggestion.theme === key ? 'border-primary' : 'border-transparent hover:border-muted'}`}
                      >
                        <span className="flex h-5 w-5 rounded-full" style={{ background: `linear-gradient(135deg, ${t.colors.slice(0, 3).join(', ')})` }} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                <div className="border rounded-lg p-3 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      预览{preview ? `（${preview.ok ? `${preview.count ?? 0} 行` : '失败'}）` : ''}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => runPreview()} disabled={previewLoading || !suggestion.sql.trim()}>
                      {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                      预览
                    </Button>
                  </div>
                  {previewLoading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> 执行中...
                    </div>
                  ) : preview ? (
                    !preview.ok && preview.error ? (
                      <div className="text-xs text-red-700 font-mono whitespace-pre-wrap">{preview.error}</div>
                    ) : preview.columns && preview.columns.length > 0 ? (
                      suggestion.chartType === 'text' ? (
                        renderTextPanel(preview.columns, preview.rows || [])
                      ) : (
                        (() => {
                          const option = suggestion.chartType === 'scatter'
                            ? sqlToScatterOption(preview.columns!, preview.rows || [], suggestion.theme)
                            : sqlToChartOption(preview.columns!, preview.rows || [], suggestion.chartType as any, suggestion.theme);
                          return option ? <EChart option={option} height={220} /> : <div className="text-sm text-muted-foreground">数据不适合绘制图表</div>;
                        })()
                      )
                    ) : (
                      <div className="text-sm text-muted-foreground">查询成功，无数据</div>
                    )
                  ) : (
                    <div className="text-center text-sm text-muted-foreground py-6">点击「预览」查看图表效果</div>
                  )}
                </div>

                {error && <div className="p-3 rounded bg-red-50 text-red-700 text-xs whitespace-pre-wrap">{error}</div>}

                <div className="flex justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setStep('input'); setError(''); }}>
                    ← 重新描述
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
                    <Button size="sm" onClick={handleConfirm} disabled={confirming || !suggestion.name.trim()}>
                      {confirming ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                      {editId ? '确认更新' : '确认生成'}
                    </Button>
                  </div>
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
