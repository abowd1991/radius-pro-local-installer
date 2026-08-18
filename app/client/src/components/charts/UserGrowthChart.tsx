import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useLanguage } from "@/contexts/LanguageContext";
import { Users, TrendingUp } from "lucide-react";

interface UserGrowthChartProps {
  data: Array<{
    date: string;
    new_users: number;
    new_clients?: number;
    new_resellers?: number;
  }>;
  isLoading?: boolean;
}

export function UserGrowthChart({ data, isLoading }: UserGrowthChartProps) {
  const { language } = useLanguage();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {language === "ar" ? "نمو المستخدمين" : "User Growth"}
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
            <Users className="h-5 w-5" />
            {language === "ar" ? "نمو المستخدمين" : "User Growth"}
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
      users: Number(item.new_users) || 0,
      clients: Number(item.new_clients) || 0,
      resellers: Number(item.new_resellers) || 0,
    };
  });

  // Calculate total
  const totalUsers = chartData.reduce((sum, item) => sum + item.users, 0);
  const maxDay = chartData.reduce((max, item) => item.users > max.users ? item : max, chartData[0]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-500" />
          {language === "ar" ? "نمو المستخدمين" : "User Growth"}
        </CardTitle>
        <CardDescription>
          {language === "ar" 
            ? `إجمالي: ${totalUsers} مستخدم | أعلى يوم: ${maxDay.users} (${maxDay.date})`
            : `Total: ${totalUsers} users | Peak day: ${maxDay.users} (${maxDay.date})`
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
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
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  users: language === 'ar' ? 'مستخدمين' : 'Users',
                  clients: language === 'ar' ? 'عملاء' : 'Clients',
                  resellers: language === 'ar' ? 'موزعين' : 'Resellers',
                };
                return [value, labels[name] || name];
              }}
            />
            <Legend 
              formatter={(value) => {
                const labels: Record<string, string> = {
                  users: language === 'ar' ? 'مستخدمين' : 'Users',
                  clients: language === 'ar' ? 'عملاء' : 'Clients',
                  resellers: language === 'ar' ? 'موزعين' : 'Resellers',
                };
                return labels[value] || value;
              }}
            />
            <Bar 
              dataKey="users" 
              fill="hsl(var(--primary))" 
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
