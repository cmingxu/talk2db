import { useEffect } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { BarChart3, Settings, Database, MessageSquare, Brain, ExternalLink } from 'lucide-react'

import { cn } from './lib/utils'
import Dashboard from './pages/Dashboard'
import DatasourceListPage from './pages/DatasourceList'
import DatasourceDetailPage from './pages/DatasourceDetail'
import SessionListPage from './pages/SessionListPage'
import ChatPage from './pages/ChatPage'
import LLMConfigPage from './pages/LLMConfig'
import { SystemConfigPage } from './pages/SystemConfig'
import DashboardView from './pages/DashboardView'
import DashboardConfigPage from './pages/DashboardConfig'
import { listDatasources } from './api/datasources'
import { Toaster } from './components/ui/toaster'

const sidebarSections = [
  {
    title: '概览',
    items: [
      { to: '/admin/dashboard', label: '仪表盘', icon: BarChart3 },
    ]
  },
  {
    title: '数据源',
    items: [
      { to: '/admin/datasources', label: '数据源', icon: Database },
    ]
  },
  {
    title: '聊天',
    items: [
      { to: '/admin/sessions', label: '会话', icon: MessageSquare },
    ]
  },
  {
    title: '设置',
    items: [
      { to: '/admin/llm-config', label: 'LLM 提供商', icon: Brain },
      { to: '/admin/system-config', label: '系统', icon: Settings },
    ]
  }
]

function AdminLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Talk2DB</div>
            <div className="text-xs text-muted-foreground">AI 驱动的 SQL 助手</div>
          </div>
        </div>
        <NavLink
          to="/chat"
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          打开仪表盘
        </NavLink>
      </header>

      <div className="flex min-h-[calc(100vh-3.5rem)]">
        <aside className="flex w-64 shrink-0 flex-col border-r bg-card p-4">
          <nav className="space-y-6">
            {sidebarSections.map((section) => (
              <div key={section.title}>
                <h4 className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {section.title}
                </h4>
                <div className="space-y-1">
                  {section.items.map((it) => (
                    <NavLink
                      key={it.to}
                      to={it.to}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                            : 'text-foreground hover:bg-muted',
                        )
                      }
                    >
                      <it.icon className="h-4 w-4" />
                      <span>{it.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="mt-auto border-t pt-4 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Talk2DB</div>
            <div>自然语言转 SQL</div>
          </div>
        </aside>

        <main className="flex min-h-[calc(100vh-3.5rem)] flex-1 flex-col p-6 bg-slate-50">
          <div className="flex-1">
            <Routes>
              {/* Nested Routes match relative to the /admin base */}
              <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/datasources" element={<DatasourceListPage />} />
              <Route path="/datasources/:id" element={<DatasourceDetailPage />} />
              <Route path="/datasources/:id/dashboard" element={<DashboardConfigPage />} />
              <Route path="/sessions" element={<SessionListPage />} />
              <Route path="/sessions/:id/chat" element={<ChatPage />} />
              <Route path="/llm-config" element={<LLMConfigPage />} />
              <Route path="/system-config" element={<SystemConfigPage />} />
              <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
            </Routes>
          </div>
          <footer className="mt-8 border-t pt-4 text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Talk2DB. AI 驱动的数据库助手。
          </footer>
        </main>
      </div>
    </div>
  )
}

// Redirect /chat (no datasource in URL) to the first datasource's dashboard,
// falling back to the admin datasource list when there are none.
function ChatIndexRedirect() {
  const nav = useNavigate()

  useEffect(() => {
    listDatasources()
      .then((list) => {
        if (list.length > 0) {
          nav(`/chat/${list[0].slug}/dashboard`, { replace: true })
        } else {
          nav('/admin/datasources', { replace: true })
        }
      })
      .catch(() => nav('/admin/datasources', { replace: true }))
  }, [nav])

  return null
}

// Legacy /chat/:slug links now land on the datasource's dashboard.
function ChatSlugRedirect() {
  const { slug } = useParams<{ slug: string }>()
  return <Navigate to={`/chat/${slug}/dashboard`} replace />
}

function ChatLayout() {
  return (
    <div className="min-h-screen text-foreground dot-grid">
      <header className="flex h-14 items-center justify-between border-b bg-card px-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Talk2DB</div>
            <div className="text-xs text-muted-foreground">AI 驱动的 SQL 助手</div>
          </div>
        </div>
        <NavLink
          to="/admin/dashboard"
          title="管理后台"
          aria-label="管理后台"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
        </NavLink>
      </header>

      <main className="p-4 relative z-10">
        <Routes>
          {/* Nested Routes match relative to the /chat base */}
          <Route path="/" element={<ChatIndexRedirect />} />
          <Route path="/:slug" element={<ChatSlugRedirect />} />
          <Route path="/:slug/dashboard" element={<DashboardView />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/*" element={<AdminLayout />} />
        <Route path="/chat/*" element={<ChatLayout />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}
