import { apiFetch } from './client';

export interface Datasource {
  id: number;
  name: string;
  engine: string;
  host: string;
  port: number;
  username: string;
  databaseName: string;
  createdAt: string;
  updatedAt: string;
}

export interface TableSpace {
  id: number;
  datasourceId: number;
  tableName: string;
  createdAt: string;
}

export interface DatasourceCreate {
  name: string;
  engine: string;
  host: string;
  port: number;
  username: string;
  password: string;
  databaseName: string;
}

export function listDatasources(): Promise<Datasource[]> {
  return apiFetch('/api/datasources');
}

export function createDatasource(data: DatasourceCreate): Promise<Datasource> {
  return apiFetch('/api/datasources', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getDatasource(id: number): Promise<Datasource> {
  return apiFetch(`/api/datasources/${id}`);
}

export function updateDatasource(id: number, data: DatasourceCreate): Promise<void> {
  return apiFetch(`/api/datasources/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteDatasource(id: number): Promise<void> {
  return apiFetch(`/api/datasources/${id}`, { method: 'DELETE' });
}

export function testConnection(id: number): Promise<{ ok: boolean; tables?: string[]; error?: string }> {
  return apiFetch(`/api/datasources/${id}/test`, { method: 'POST' });
}

export function listTables(id: number): Promise<{ tables: string[] }> {
  return apiFetch(`/api/datasources/${id}/tables`);
}

export function listTableSpaces(datasourceId: number): Promise<TableSpace[]> {
  return apiFetch(`/api/datasources/${datasourceId}/tablespaces`);
}

export function addTableSpaces(datasourceId: number, tables: string[]): Promise<void> {
  return apiFetch(`/api/datasources/${datasourceId}/tablespaces`, {
    method: 'POST',
    body: JSON.stringify({ tables }),
  });
}

export interface SqlExecuteResult {
  ok: boolean;
  columns?: string[];
  rows?: string[][];
  count?: number;
  error?: string;
}

export function executeSql(datasourceId: number, query: string, signal?: AbortSignal): Promise<SqlExecuteResult> {
  return apiFetch(`/api/datasources/${datasourceId}/execute`, {
    method: 'POST',
    body: JSON.stringify({ query }),
    signal,
  });
}

export function removeTableSpace(datasourceId: number, tableSpaceId: number): Promise<void> {
  return apiFetch(`/api/datasources/${datasourceId}/tablespaces/${tableSpaceId}`, {
    method: 'DELETE',
  });
}
