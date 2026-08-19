import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useLanguage } from "@/contexts/LanguageContext";
import { Activity } from "lucide-react";

interface SessionsTimelineChartProps {
  data: Array<{
    hour: string;
    session_count: number;
    unique_users?: number;
  }>;
  isLoading?: boolean;
}

export function SessionsTimelineChart({ data, isLoading }: SessionsTimelineChartProps) {
  const { language } = useLanguage();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {language === "ar" ? "الجلسات النشطة" : "Active Sessions"}
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
            <Activity className="h-5 w-5" />
            {language === "ar" ? "الجلسات النشطة" : "Active Sessions"}
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
  const chartData = data.map(item => {
    const _h = String(item.hour).replace(' ', 'T');
    const hourDate = new Date(_h);
    const timeLabel = isNaN(hourDate.getTime())
      ? _h
      : `${String(hourDate.getHours()).padStart(2,'0')}:00`;
    return {
      time: timeLabel,
      sessions: Number(item.session_count) || 0,
      users: Number(item.unique_users) || 0,
    };
  });

  // Calculate peak hour
  const peakHour = chartData.reduce((max, item) => item.sessions > max.sessions ? item : max, chartData[0]);
  const totalSessions = chartData.reduce((sum, item) => sum + item.sessions, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-purple-500" />
          {language === "ar" ? "الجلسات - آخر 24 ساعة" : "Sessions - Last 24 Hours"}
        </CardTitle>
        <CardDescription>
          {language === "ar" 
            ? `إجمالي: ${totalSessions} جلسة | ذروة: ${peakHour.sessions} (${peakHour.time})`
            : `Total: ${totalSessions} sessions | Peak: ${peakHour.sessions} (${peakHour.time})`
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="time" 
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
              interval="preserveStartEnd"
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
              formatter={(value: any, name: any) => {
                if (name === 'sessions') {
                  return [value, language === 'ar' ? 'جلسات' : 'Sessions'];
                }
                return [value, language === 'ar' ? 'مستخدمين' : 'Users'];
              }}
            />
            <Area 
              type="monotone" 
              dataKey="sessions" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorSessions)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
