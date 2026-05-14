import { apiFetch } from './client';

export interface LLMConfig {
  id: number;
  provider: string;
  baseUrl: string;
  modelName: string;
  createdAt: string;
  updatedAt: string;
}

export interface LLMConfigUpdate {
  provider: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
}

export function getLLMConfig(): Promise<LLMConfig> {
  return apiFetch('/api/llm-config');
}

export function updateLLMConfig(data: LLMConfigUpdate): Promise<void> {
  return apiFetch('/api/llm-config', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function testLLMConnection(): Promise<{ ok: boolean; error?: string }> {
  return apiFetch('/api/llm-config/test', { method: 'POST' });
}
