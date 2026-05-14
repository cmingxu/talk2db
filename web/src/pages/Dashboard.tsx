import { useEffect, useState } from 'react';
import { BarChart3, Database, MessageSquare, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/use-toast';

interface DashboardStats {
  user_count: number;
  datasource_count: number;
  session_count: number;
  time: string;
}

function StatCard({ icon: Icon, label, value, onClick }: { icon: any; label: string; value: number; onClick?: () => void }) {
  return (
    <div className={`bg-white p-6 rounded-lg border shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`} onClick={onClick}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const { toast } = useToast();
  const nav = useNavigate();

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(setStats)
      .catch(e => toast({ title: '错误', description: e.message, variant: 'destructive' }));
  }, []);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center gap-2 text-xl font-medium text-muted-foreground bg-white p-4 rounded-lg border shadow-sm">
        <BarChart3 className="h-5 w-5" />
        仪表盘
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Database} label="数据源" value={stats?.datasource_count ?? 0} onClick={() => nav('/datasources')} />
        <StatCard icon={MessageSquare} label="会话" value={stats?.session_count ?? 0} onClick={() => nav('/sessions')} />
        <StatCard icon={Users} label="用户" value={stats?.user_count ?? 0} onClick={() => nav('/user-management')} />
      </div>
    </div>
  );
}
