import React from "react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const trendData = [
  { name: "Mon", tickets: 12 },
  { name: "Tue", tickets: 19 },
  { name: "Wed", tickets: 15 },
  { name: "Thu", tickets: 22 },
  { name: "Fri", tickets: 30 },
  { name: "Sat", tickets: 8 },
  { name: "Sun", tickets: 5 },
];

const priorityData = [
  { name: "Critical", value: 3, color: "#f43f5e" },
  { name: "High", value: 8, color: "#f59e0b" },
  { name: "Medium", value: 15, color: "#3b82f6" },
  { name: "Low", value: 12, color: "#64748b" },
];

export const OverviewCharts = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 border-none shadow-sm bg-card/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Volume Trend</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: "#64748b" }} 
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: "#64748b" }} 
              />
              <Tooltip 
                contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
              />
              <Line 
                type="monotone" 
                dataKey="tickets" 
                stroke="#3b82f6" 
                strokeWidth={3} 
                dot={{ r: 4, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm bg-card/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Priority Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex flex-col items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={priorityData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {priorityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-4 mt-4 w-full">
            {priorityData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">{item.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};