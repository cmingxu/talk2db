import { useEffect, useState } from 'react'
import { Settings, ShieldCheck } from 'lucide-react';

import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useToast } from '../hooks/use-toast';

export function SystemConfigPage() {
  const [warnText, setWarnText] = useState('')
  const { toast } = useToast()

  useEffect(() => {
    fetch('/api/system-config')
      .then((r) => r.json())
      .then((d: { items: Record<string, string> }) => {
        setWarnText(d.items?.warn_text ?? '')
      })
      .catch((e) => {
        toast({
          title: '错误',
          description: (e as Error).message,
          variant: 'destructive',
        })
      })
  }, [toast])

  const onSave = async () => {
    try {
      const r = await fetch('/api/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'warn_text', value: warnText }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)

      toast({
        title: '成功',
        description: '设置已更新。',
      })
    } catch (e) {
      toast({
        title: '错误',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center gap-2 text-xl font-medium text-muted-foreground bg-white p-4 rounded-lg border shadow-sm">
        <Settings className="h-5 w-5" />
        系统设置
      </div>

      <div className="space-y-4 bg-white p-6 rounded-lg border shadow-sm max-w-4xl">
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-base font-medium border-b pb-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            通用设置
          </h2>

          <div className="space-y-2">
            <Label>警告文本</Label>
            <Input value={warnText} onChange={(e) => setWarnText(e.target.value)} placeholder="输入警告文本..." />
            <p className="text-sm text-muted-foreground">
              此文本将作为默认系统警告信息显示。
            </p>
          </div>

          <Button onClick={onSave}>保存</Button>
        </div>
      </div>
    </div>
  )
}
