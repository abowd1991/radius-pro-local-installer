import { Card } from '@/components/ui/card';
import { Server, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface NasHealthWidgetProps {
  data: {
    statusCounts: Array<{ status: string; count: number }>;
    topNas: Array<{ nasname: string; shortname: string; active_sessions: number }>;
  };
  isLoading?: boolean;
}

const STATUS_COLORS = {
  active: 'hsl(var(--chart-1))',
  inactive: 'hsl(var(--chart-3))',
  pending: 'hsl(var(--chart-4))',
  error: 'hsl(var(--destructive))',
};

const STATUS_ICONS = {
  active: CheckCircle2,
  inactive: XCircle,
  pending: AlertCircle,
  error: XCircle,
};

export function NasHealthWidget({ data, isLoading }: NasHealthWidgetProps) {
  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-1/3 mb-4"></div>
          <div className="h-[300px] bg-muted rounded"></div>
        </div>
      </Card>
    );
  }

  const chartData = data.statusCounts.map(item => ({
    name: item.status,
    value: Number(item.count),
  }));

  const totalNas = chartData.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            NAS Health Status
            <span className="text-sm text-muted-foreground mr-2">حالة أجهزة NAS</span>
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of all NAS devices
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{isNaN(totalNas) ? 0 : totalNas}</div>
          <p className="text-sm text-muted-foreground">Total NAS</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${entry.name}-${index}`} fill={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS] || 'hsl(var(--muted))'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Status List */}
        <div className="space-y-3">
          {data.statusCounts.map((item, idx) => {
            const Icon = STATUS_ICONS[item.status as keyof typeof STATUS_ICONS] || Server;
            return (
              <div key={item.status ?? `status-${idx}`} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" style={{ color: STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] }} />
                  <span className="font-medium capitalize">{item.status}</span>
                </div>
                <span className="font-bold">{isNaN(Number(item.count)) ? 0 : Number(item.count)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top NAS by Sessions */}
      {data.topNas.length > 0 && (
        <div className="mt-6 pt-6 border-t">
          <h4 className="text-sm font-semibold mb-3">Top NAS by Active Sessions</h4>
          <div className="space-y-2">
            {data.topNas.slice(0, 5).map((nas, index) => (
              <div key={`${nas.nasname}-${index}`} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">#{index + 1}</span>
                  <span className="font-medium">{nas.shortname || nas.nasname}</span>
                </div>
                <span className="font-semibold">{Number(nas.active_sessions) || 0} sessions</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
