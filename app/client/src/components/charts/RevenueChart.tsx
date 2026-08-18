import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useLanguage } from "@/contexts/LanguageContext";
import { TrendingUp, DollarSign } from "lucide-react";

interface RevenueChartProps {
  data: Array<{
    date: string;
    revenue: number;
    transaction_count?: number;
  }>;
  isLoading?: boolean;
}

export function RevenueChart({ data, isLoading }: RevenueChartProps) {
  const { language } = useLanguage();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {language === "ar" ? "اتجاه الإيرادات" : "Revenue Trend"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-muted-foreground">{language === "ar" ? "جاري التحميل..." : "Loading..."}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {language === "ar" ? "اتجاه الإيرادات" : "Revenue Trend"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-muted-foreground">{language === "ar" ? "لا توجد بيانات" : "No data available"}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Format data for chart
  const _months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const chartData = data.map(item => {
    const dt = new Date(String(item.date) + 'T00:00:00');
    const dateLabel = isNaN(dt.getTime()) ? String(item.date) : `${dt.getDate()} ${_months[dt.getMonth()]}`;
    return {
      date: dateLabel,
      revenue: Number(item.revenue) || 0,
      transactions: item.transaction_count || 0,
    };
  });

  // Calculate total and average
  const totalRevenue = chartData.reduce((sum, item) => sum + item.revenue, 0);
  const avgRevenue = totalRevenue / chartData.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-500" />
          {language === "ar" ? "اتجاه الإيرادات" : "Revenue Trend"}
        </CardTitle>
        <CardDescription>
          {language === "ar" 
            ? `إجمالي: $${totalRevenue.toFixed(2)} | متوسط: $${avgRevenue.toFixed(2)}/يوم`
            : `Total: $${totalRevenue.toFixed(2)} | Average: $${avgRevenue.toFixed(2)}/day`
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="date" 
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis 
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(value: number, name: string) => {
                if (name === 'revenue') {
                  return [`$${value.toFixed(2)}`, language === 'ar' ? 'الإيرادات' : 'Revenue'];
                }
                return [value, language === 'ar' ? 'المعاملات' : 'Transactions'];
              }}
            />
            <Legend 
              formatter={(value) => {
                if (value === 'revenue') return language === 'ar' ? 'الإيرادات' : 'Revenue';
                if (value === 'transactions') return language === 'ar' ? 'المعاملات' : 'Transactions';
                return value;
              }}
            />
            <Line 
              type="monotone" 
              dataKey="revenue" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--primary))', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
