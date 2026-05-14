import { apiFetch } from './client';

export interface Session {
  id: number;
  name: string;
  datasourceId: number;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: number;
  sessionId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sql?: string;
  createdAt: string;
}

export function listSessions(datasourceId?: number): Promise<Session[]> {
  const qs = datasourceId ? `?datasourceId=${datasourceId}` : '';
  return apiFetch(`/api/sessions${qs}`);
}

export function createSession(name: string, datasourceId: number): Promise<Session> {
  return apiFetch('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ name, datasourceId }),
  });
}

export interface RecentSession {
  id: number;
  name: string;
  datasourceId: number;
  datasourceName: string;
  lastMessage: string;
  updatedAt: string;
}

export function getSession(id: number): Promise<Session> {
  return apiFetch(`/api/sessions/${id}`);
}

export function updateSession(id: number, name: string): Promise<void> {
  return apiFetch(`/api/sessions/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export function deleteSession(id: number): Promise<void> {
  return apiFetch(`/api/sessions/${id}`, { method: 'DELETE' });
}

export function getMessages(sessionId: number): Promise<Message[]> {
  return apiFetch(`/api/sessions/${sessionId}/messages`);
}

export function getOrCreateNormalSession(datasourceId: number): Promise<{ sessionId: number; sessionName: string }> {
  return apiFetch('/api/normal/chat-session', {
    method: 'POST',
    body: JSON.stringify({ datasourceId }),
  });
}

export function getRecentSessions(): Promise<RecentSession[]> {
  return apiFetch('/api/sessions/recent');
}
