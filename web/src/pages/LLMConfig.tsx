import { useEffect, useState } from 'react';
import { Settings, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useToast } from '../hooks/use-toast';
import { getLLMConfig, updateLLMConfig, testLLMConnection, type LLMConfig } from '../api/llm';

export default function LLMConfigPage() {
  const [cfg, setCfg] = useState<LLMConfig | null>(null);
  const [form, setForm] = useState({ provider: '', baseUrl: '', apiKey: '', modelName: '' });
  const [testResult, setTestResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    getLLMConfig().then(c => {
      setCfg(c);
      setForm({ provider: c.provider, baseUrl: c.baseUrl, apiKey: '', modelName: c.modelName });
    }).catch(e => toast({ title: '错误', description: e.message, variant: 'destructive' }));
  }, []);

  const handleSave = async () => {
    try {
      await updateLLMConfig(form);
      toast({ title: '已保存', description: 'LLM 配置已更新。' });
    } catch (e: any) {
      toast({ title: '错误', description: e.message, variant: 'destructive' });
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try { await updateLLMConfig(form); } catch (e: any) {
      setTestResult({ ok: false, error: '保存失败：' + e.message });
      setTesting(false);
      return;
    }
    try {
      const res = await testLLMConnection();
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
    }
    setTesting(false);
  };

  const providerPresets: Record<string, { baseUrl: string; modelName: string }> = {
    deepseek: { baseUrl: 'https://api.deepseek.com/v1', modelName: 'deepseek-chat' },
    openai: { baseUrl: 'https://api.openai.com/v1', modelName: 'gpt-4o' },
  };

  const handleProviderChange = (provider: string) => {
    const preset = providerPresets[provider];
    if (preset) {
      setForm({ ...form, provider, baseUrl: preset.baseUrl, modelName: preset.modelName });
    } else {
      setForm({ ...form, provider });
    }
  };

  const apiKeyHint = cfg ? '（留空以保留当前值）' : '（首次保存时必填）';

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center gap-2 text-xl font-medium bg-white p-4 rounded-lg border shadow-sm">
        <Settings className="h-5 w-5" />
        LLM 提供商
      </div>

      <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4 max-w-2xl">
        <div className="space-y-2">
          <Label>提供商</Label>
          <select
            className="w-full border rounded-md p-2 text-sm bg-background"
            value={form.provider}
            onChange={e => handleProviderChange(e.target.value)}
          >
            <option value="" disabled>选择提供商...</option>
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI</option>
            <option value="custom">自定义 (OpenAI 兼容)</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>基础 URL</Label>
          <Input
            value={form.baseUrl}
            onChange={e => setForm({ ...form, baseUrl: e.target.value })}
            placeholder="https://api.deepseek.com/v1"
          />
        </div>
        <div className="space-y-2">
          <Label>API 密钥</Label>
          <Input
            type="password"
            value={form.apiKey}
            onChange={e => setForm({ ...form, apiKey: e.target.value })}
            placeholder={apiKeyHint}
          />
          <p className="text-xs text-muted-foreground">{apiKeyHint}</p>
        </div>
        <div className="space-y-2">
          <Label>模型名称</Label>
          <Input
            value={form.modelName}
            onChange={e => setForm({ ...form, modelName: e.target.value })}
            placeholder="deepseek-chat"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave}>保存</Button>
          <Button onClick={handleTest} variant="outline" disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} 测试连接
          </Button>
        </div>

        {testResult && (
          <div className={`p-3 rounded ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult.ok ? (
              <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4" /> LLM 连接成功。</div>
            ) : (
              <div className="flex items-center gap-2"><XCircle className="h-4 w-4" /> {testResult.error}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
