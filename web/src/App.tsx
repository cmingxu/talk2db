import { useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { BarChart3, Settings, Users, Database, MessageSquare, Brain } from 'lucide-react'

import { cn } from './lib/utils'
import { useAuth } from './hooks/useAuth'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import PrivateRoute from './components/PrivateRoute'
import DatasourceListPage from './pages/DatasourceList'
import DatasourceDetailPage from './pages/DatasourceDetail'
import SessionListPage from './pages/SessionListPage'
import ChatPage from './pages/ChatPage'
import NormalChatPage from './pages/NormalChatPage'
import LLMConfigPage from './pages/LLMConfig'
import { SystemConfigPage } from './pages/SystemConfig'
import UserManagement from './pages/UserManagement'
import { Toaster } from './components/ui/toaster'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog"

const sidebarSections = [
  {
    title: '概览',
    items: [
      { to: '/dashboard', label: '仪表盘', icon: BarChart3 },
    ]
  },
  {
    title: '数据源',
    items: [
      { to: '/datasources', label: '数据源', icon: Database },
    ]
  },
  {
    title: '聊天',
    items: [
      { to: '/sessions', label: '会话', icon: MessageSquare },
    ]
  },
  {
    title: '设置',
    items: [
      { to: '/llm-config', label: 'LLM 提供商', icon: Brain },
      { to: '/system-config', label: '系统', icon: Settings },
      { to: '/user-management', label: '用户', icon: Users },
    ]
  }
]

function LogoutButton() {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <>
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full border bg-background text-foreground cursor-pointer hover:bg-muted transition-colors"
        onClick={() => setShowLogoutConfirm(true)}
        title="退出登录"
      >
        <Users className="h-4 w-4" />
      </div>
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认退出</AlertDialogTitle>
            <AlertDialogDescription>
              确定要退出登录吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>退出登录</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

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
        <div className="flex items-center gap-2">
          <LogoutButton />
        </div>
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
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/datasources" element={<DatasourceListPage />} />
              <Route path="/datasources/:id" element={<DatasourceDetailPage />} />
              <Route path="/sessions" element={<SessionListPage />} />
              <Route path="/sessions/:id/chat" element={<ChatPage />} />
              <Route path="/llm-config" element={<LLMConfigPage />} />
              <Route path="/system-config" element={<SystemConfigPage />} />
              <Route path="/user-management" element={<UserManagement />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
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

function NormalLayout() {
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
        <LogoutButton />
      </header>

      <main className="p-4 relative z-10">
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<NormalChatPage />} />
          <Route path="/chat/:id" element={<ChatPage />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const { isLoading, role } = useAuth();

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">加载中...</div>;
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              {role === 'admin' ? <AdminLayout /> : <NormalLayout />}
            </PrivateRoute>
          }
        />
      </Routes>
      <Toaster />
    </>
  )
}
