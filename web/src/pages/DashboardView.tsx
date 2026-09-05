import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, Settings2, RefreshCw, Loader2, MessageSquare, Clock, Download, FileDown, Maximize2, X } from 'lucide-react';
import { lookupDatasource, type Datasource } from '../api/datasources';
import { listPanels, fetchPanelsData, exportPanelRaw, type DashboardPanel, type PanelData } from '../api/panels';
import { sqlToChartOption, sqlToScatterOption, renderTextPanel, CHART_TYPE_LABELS } from '../lib/chartBuilder';
import { downloadCsv } from '../lib/downloadExcel';
import EChart from '../components/EChart';
import InlineChatPanel from '../components/InlineChatPanel';

interface PanelCardProps {
  panel: DashboardPanel;
  data?: PanelData;
  loading: boolean;
  autoRefresh: boolean;
  onRefresh: (panelId: number) => void;
  onZoom: (panel: DashboardPanel, data?: PanelData) => void;
}

function PanelCard({ panel, data, loading, autoRefresh, onRefresh, onZoom }: PanelCardProps) {
  // Per-panel auto refresh (only when the global switch is on and interval > 0).
  useEffect(() => {
    if (!autoRefresh || panel.refreshInterval <= 0) return;
    const t = setInterval(() => onRefresh(panel.id), panel.refreshInterval * 1000);
    return () => clearInterval(t);
  }, [autoRefresh, panel.refreshInterval, panel.id, onRefresh]);

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
        <span className="text-sm font-medium truncate">{panel.name}</span>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <span className="text-[10px] uppercase bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
            {CHART_TYPE_LABELS[panel.chartType] || panel.chartType}
          </span>
          {panel.refreshInterval > 0 && (
            <span className="text-[10px] text-muted-foreground" title="自动刷新间隔">
              {panel.refreshInterval >= 60 ? `${Math.round(panel.refreshInterval / 60)}m` : `${panel.refreshInterval}s`}
            </span>
          )}
          <button
            onClick={() => data && exportPanelRaw(panel.datasourceId, panel.id, panel.name).catch(() => {})}
            title="导出原始数据（全量）"
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted text-muted-foreground"
          >
            <FileDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => data?.columns && downloadCsv(data.columns, data.rows || [], panel.name)}
            disabled={!data?.columns}
            title="导出当前数据 (CSV)"
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted text-muted-foreground disabled:opacity-30"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="p-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : data?.error ? (
          <div className="p-3 rounded bg-red-50 text-red-700 text-xs font-mono whitespace-pre-wrap">{data.error}</div>
        ) : !data?.columns || data.columns.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">无数据</div>
        ) : panel.chartType === 'text' ? (
          renderTextPanel(data.columns, data.rows || [])
        ) : (
          (() => {
            const option = panel.chartType === 'scatter'
              ? sqlToScatterOption(data.columns!, data.rows || [], panel.theme)
              : sqlToChartOption(data.columns!, data.rows || [], panel.chartType as any, panel.theme);
            return option ? (
              <EChart option={option} height={260} />
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">数据不适合绘制图表</div>
            );
          })()
        )}
      </div>
      <div className="flex justify-end px-3 pb-2">
        <button
          onClick={() => onZoom(panel, data)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Maximize2 className="h-3 w-3" /> 放大
        </button>
      </div>
    </div>
  );
}

/** Fullscreen popup showing a single panel enlarged. */
function ZoomModal({ panel, data, onClose }: { panel: DashboardPanel; data?: PanelData; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold truncate">{panel.name}</span>
            <span className="text-[10px] uppercase bg-muted px-2 py-0.5 rounded text-muted-foreground shrink-0">
              {CHART_TYPE_LABELS[panel.chartType] || panel.chartType}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {panel.refreshInterval > 0 && (
              <span className="text-xs text-muted-foreground">每 {panel.refreshInterval >= 60 ? `${Math.round(panel.refreshInterval / 60)} 分钟` : `${panel.refreshInterval} 秒`} 刷新</span>
            )}
            <button onClick={onClose} title="关闭" className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted text-muted-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5 bg-slate-50/60">
          {data?.error ? (
            <div className="p-3 rounded bg-red-50 text-red-700 text-xs font-mono whitespace-pre-wrap">{data.error}</div>
          ) : !data?.columns || data.columns.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">无数据</div>
          ) : panel.chartType === 'text' ? (
            <div className="flex items-center justify-center py-10">
              {renderTextPanel(data.columns, data.rows || [])}
            </div>
          ) : (
            (() => {
              const option = panel.chartType === 'scatter'
                ? sqlToScatterOption(data.columns!, data.rows || [], panel.theme)
                : sqlToChartOption(data.columns!, data.rows || [], panel.chartType as any, panel.theme);
              return option ? (
                <EChart option={option} height={Math.max(420, window.innerHeight - 260)} />
              ) : (
                <div className="py-16 text-center text-sm text-muted-foreground">数据不适合绘制图表</div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardView() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const [ds, setDs] = useState<Datasource | null>(null);
  const [dsError, setDsError] = useState('');
  const [panels, setPanels] = useState<DashboardPanel[]>([]);
  const [dataMap, setDataMap] = useState<Record<number, PanelData>>({});
  const [loading, setLoading] = useState(false);
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [zoom, setZoom] = useState<{ panel: DashboardPanel; data?: PanelData } | null>(null);

  const load = useCallback(async () => {
    if (!ds) return;
    setLoading(true);
    try {
      const list = await listPanels(ds.id);
      setPanels(list);
      if (list.length > 0) {
        // Fetch each panel's data independently and update the map as each
        // resolves, so cards render progressively instead of waiting for all.
        await Promise.all(list.map(async p => {
          try {
            const { panels: results } = await fetchPanelsData(ds.id, [p.id]);
            if (results.length > 0) {
              setDataMap(prev => ({ ...prev, [p.id]: results[0] }));
            }
          } catch { /* keep previous data for this panel */ }
        }));
      } else {
        setDataMap({});
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [ds]);

  // Silent data refresh (no spinner) — used by per-panel timers.
  const refreshPanel = useCallback(async (panelId: number) => {
    if (!ds) return;
    try {
      const { panels: results } = await fetchPanelsData(ds.id, [panelId]);
      if (results.length > 0) {
        setDataMap(prev => ({ ...prev, [panelId]: results[0] }));
      }
    } catch { /* keep last data on failure */ }
  }, [ds]);

  useEffect(() => {
    if (!slug) return;
    lookupDatasource(slug)
      .then(setDs)
      .catch(e => setDsError(e.message));
  }, [slug]);

  useEffect(() => { if (ds) load(); }, [ds, load]);

  if (dsError) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] px-4 text-center space-y-4">
        <p className="text-muted-foreground">数据源不存在或已删除（{slug}）</p>
        <Link to="/admin/datasources" className="text-sm text-primary underline">前往管理后台</Link>
      </div>
    );
  }

  if (!ds) {
    return <div className="flex items-center justify-center h-[calc(100vh-8rem)]"><p className="text-muted-foreground">加载中...</p></div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => nav('/admin/datasources')} title="返回数据源列表" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-tight truncate flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-primary shrink-0" />
              {ds.chatTitle || ds.name} · 仪表盘
            </div>
            {ds.chatDesc && (
              <div className="text-xs text-muted-foreground truncate">{ds.chatDesc}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? '自动刷新：开启（每 60 秒）' : '自动刷新：关闭'}
            className={`flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted ${
              autoRefresh ? 'text-primary border-primary/40 bg-primary/5' : 'text-muted-foreground'
            }`}
          >
            <Clock className="h-4 w-4" />
          </button>
          <button
            onClick={load}
            disabled={loading}
            title="刷新数据"
            className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted text-muted-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to={`/admin/datasources/${ds.id}/dashboard`}
            className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Settings2 className="h-4 w-4" /> 编辑仪表盘
          </Link>
          <button
            onClick={() => setChatFullscreen(!chatFullscreen)}
            className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            title={chatFullscreen ? '恢复分栏' : '聊天全屏'}
          >
            <MessageSquare className="h-4 w-4" /> {chatFullscreen ? '恢复分栏' : '聊天全屏'}
          </button>
        </div>
      </div>

      {/* Body: dashboard grid + chat panel */}
      <div className="flex flex-1 gap-3 min-h-0">
        {!chatFullscreen && (
          <div className="flex-1 min-w-0 overflow-y-auto pr-1">
            {panels.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
                <LayoutDashboard className="h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">仪表盘还是空的</p>
                <Link
                  to={`/admin/datasources/${ds.id}/dashboard`}
                  className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                >
                  去添加面板
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 auto-rows-min">
                {panels.map(p => (
                  <PanelCard
                    key={p.id}
                    panel={p}
                    data={dataMap[p.id]}
                    loading={loading && !dataMap[p.id]}
                    autoRefresh={autoRefresh}
                    onRefresh={refreshPanel}
                    onZoom={(panel, data) => setZoom({ panel, data })}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className={chatFullscreen ? 'flex-1 min-w-0 rounded-lg border overflow-hidden' : 'w-1/4 min-w-[260px] rounded-lg border overflow-hidden'}>
          <InlineChatPanel
            datasourceId={ds.id}
            isFullscreen={chatFullscreen}
            onToggleFullscreen={() => setChatFullscreen(!chatFullscreen)}
          />
        </div>
      </div>

      {zoom && <ZoomModal panel={zoom.panel} data={zoom.data} onClose={() => setZoom(null)} />}
    </div>
  );
}
