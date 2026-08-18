import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card } from '@/components/ui/card';
import { Activity, Users } from 'lucide-react';

interface SessionsTrendChartProps {
  data: Array<{
    date: string;
    unique_users: number;
    total_sessions: number;
    total_hours: number;
  }>;
  isLoading?: boolean;
}

export function SessionsTrendChart({ data, isLoading }: SessionsTrendChartProps) {
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

  const totalSessions = data.reduce((sum, item) => sum + Number(item.total_sessions || 0), 0);
  const totalUsers = data.reduce((sum, item) => sum + Number(item.unique_users || 0), 0);

  // Handle NaN values
  const displaySessions = isNaN(totalSessions) ? 0 : totalSessions;
  const displayUsers = isNaN(totalUsers) ? 0 : totalUsers;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Sessions Trend
            <span className="text-sm text-muted-foreground mr-2">اتجاه الجلسات</span>
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Active sessions and unique users over time
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6 text-blue-600" />
            {displaySessions}
          </div>
          <p className="text-sm text-muted-foreground">
            {displayUsers} unique users
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <defs>
            <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
            </linearGradient>
            <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.1}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="date" 
            className="text-xs"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis 
            className="text-xs"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px'
            }}
          />
          <Legend />
          <Area 
            type="monotone" 
            dataKey="total_sessions" 
            stroke="hsl(var(--primary))" 
            fillOpacity={1}
            fill="url(#colorSessions)"
            name="Total Sessions"
          />
          <Area 
            type="monotone" 
            dataKey="unique_users" 
            stroke="hsl(var(--chart-2))" 
            fillOpacity={1}
            fill="url(#colorUsers)"
            name="Unique Users"
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
