import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card } from '@/components/ui/card';
import { TrendingUp, DollarSign } from 'lucide-react';

interface RevenueTrendChartProps {
  data: Array<{
    date: string;
    revenue: number;
    transaction_count: number;
  }>;
  isLoading?: boolean;
}

export function RevenueTrendChart({ data, isLoading }: RevenueTrendChartProps) {
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

  const totalRevenue = data.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const avgRevenue = data.length > 0 ? totalRevenue / data.length : 0;

  // Handle NaN values
  const displayTotal = isNaN(totalRevenue) ? 0 : totalRevenue;
  const displayAvg = isNaN(avgRevenue) ? 0 : avgRevenue;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Revenue Trend
            <span className="text-sm text-muted-foreground mr-2">اتجاه الإيرادات</span>
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Daily revenue over the selected period
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 text-2xl font-bold">
            <DollarSign className="h-6 w-6 text-green-600" />
            ${displayTotal.toFixed(2)}
          </div>
          <p className="text-sm text-muted-foreground">
            Avg: ${displayAvg.toFixed(2)}/day
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="revenue" 
            stroke="hsl(var(--primary))" 
            strokeWidth={2}
            dot={{ fill: 'hsl(var(--primary))', r: 4 }}
            activeDot={{ r: 6 }}
            name="Revenue"
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
