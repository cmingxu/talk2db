import { apiFetch } from './client';

export type ChartType = 'bar' | 'pie' | 'line' | 'text' | 'scatter' | 'bar-stack';

export interface DashboardPanel {
  id: number;
  datasourceId: number;
  name: string;
  sql: string;
  chartType: ChartType;
  theme: string;
  sortOrder: number;
  refreshInterval: number;
  createdAt: string;
  updatedAt: string;
}

export interface PanelCreate {
  name: string;
  sql: string;
  chartType: ChartType;
  theme: string;
  sortOrder?: number;
  refreshInterval?: number;
}

export interface PanelData {
  id: number;
  name: string;
  chartType: ChartType;
  theme: string;
  columns?: string[];
  rows?: string[][];
  count: number;
  error?: string;
}

export function listPanels(datasourceId: number): Promise<DashboardPanel[]> {
  return apiFetch(`/api/datasources/${datasourceId}/panels`);
}

export function createPanel(datasourceId: number, data: PanelCreate): Promise<DashboardPanel> {
  return apiFetch(`/api/datasources/${datasourceId}/panels`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updatePanel(datasourceId: number, panelId: number, data: PanelCreate): Promise<void> {
  return apiFetch(`/api/datasources/${datasourceId}/panels/${panelId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deletePanel(datasourceId: number, panelId: number): Promise<void> {
  return apiFetch(`/api/datasources/${datasourceId}/panels/${panelId}`, { method: 'DELETE' });
}

export interface PanelSuggestion {
  name: string;
  sql: string;
  chartType: ChartType;
  theme: string;
}

/** Uses the LLM to generate a panel suggestion (name + sql + chartType + theme) from a natural-language request. */
export function generatePanel(datasourceId: number, request: string): Promise<PanelSuggestion> {
  return apiFetch(`/api/datasources/${datasourceId}/panels/generate`, {
    method: 'POST',
    body: JSON.stringify({ request }),
  });
}

/** Executes panel SQLs (all panels when panelIds is empty) and returns data. */
export function fetchPanelsData(datasourceId: number, panelIds?: number[]): Promise<{ panels: PanelData[] }> {
  return apiFetch(`/api/datasources/${datasourceId}/panels/data`, {
    method: 'POST',
    body: JSON.stringify(panelIds && panelIds.length > 0 ? { panelIds } : {}),
  });
}

/**
 * Downloads the panel's FULL raw query result as CSV (no row cap).
 * Uses a plain fetch (blob download, not JSON).
 */
export async function exportPanelRaw(datasourceId: number, panelId: number, fallbackName: string): Promise<void> {
  const res = await fetch(`/api/datasources/${datasourceId}/panels/${panelId}/export`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  // The anchor's download attribute overrides any Content-Disposition, so we
  // set the real (possibly Chinese) name client-side for a guaranteed-correct
  // filename; the server header remains for direct-link/curl consumers.
  const filename = `${sanitizeFileName(fallbackName || 'panel')}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 80) || 'panel';
}
