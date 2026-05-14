import { useEffect, useState } from 'react'
import { Activity, BarChart3, Users } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

type DashboardResponse = {
  user_count: number
  time: string
}

export function GlobalProbabilityPage() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as DashboardResponse
      })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <div className="text-sm text-red-600">Error: {error}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xl font-medium text-muted-foreground bg-white p-4 rounded-lg border shadow-sm">
        <BarChart3 className="h-5 w-5" />
        Dashboard
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              {data ? data.user_count : '—'}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Registered users in the system</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-500" />
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              Online
            </div>
            <div className="mt-2 text-xs text-muted-foreground">System is running</div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
