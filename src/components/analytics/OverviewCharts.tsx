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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const trendData = [
  { name: "13 May", created: 400, resolved: 240 },
  { name: "14 May", created: 800, resolved: 600 },
  { name: "15 May", created: 600, resolved: 500 },
  { name: "16 May", created: 400, resolved: 300 },
  { name: "17 May", created: 500, resolved: 450 },
  { name: "18 May", created: 700, resolved: 650 },
  { name: "19 May", created: 900, resolved: 800 },
];

const categoryData = [
  { name: "Bug", value: 376, color: "#3b82f6", percentage: "30%" },
  { name: "Integration", value: 312, color: "#6366f1", percentage: "25%" },
  { name: "Workflow", value: 225, color: "#8b5cf6", percentage: "18%" },
  { name: "Data", value: 175, color: "#a855f7", percentage: "14%" },
  { name: "UI / Usability", value: 160, color: "#d946ef", percentage: "13%" },
];

const priorityData = [
  { name: "Critical", value: 124, color: "#f43f5e", percentage: "10%" },
  { name: "High", value: 312, color: "#f59e0b", percentage: "25%" },
  { name: "Medium", value: 436, color: "#3b82f6", percentage: "35%" },
  { name: "Low", value: 376, color: "#10b981", percentage: "30%" },
];

export const OverviewCharts = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Ticket Trend */}
      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-900">Ticket Trend (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
              <Line type="monotone" dataKey="created" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tickets by Category */}
      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-900">Tickets by Category</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] flex flex-col">
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                  {categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-1 gap-1 mt-2">
            {categoryData.slice(0, 3).map((item) => (
              <div key={item.name} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600">{item.name}</span>
                </div>
                <span className="font-semibold text-slate-900">{item.percentage} ({item.value})</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SLA Compliance */}
      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-900">SLA Compliance (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] flex flex-col items-center justify-center">
          <div className="relative h-32 w-32 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={[{ value: 94 }, { value: 6 }]} cx="50%" cy="50%" innerRadius={45} outerRadius={55} startAngle={90} endAngle={450} dataKey="value">
                  <Cell fill="#10b981" />
                  <Cell fill="#f1f5f9" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-slate-900">94%</span>
              <span className="text-[10px] text-slate-500">Compliance</span>
            </div>
          </div>
          <div className="w-full mt-4 space-y-2">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Within SLA</span>
              <span className="font-bold text-emerald-600">1,176</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Breached</span>
              <span className="font-bold text-rose-600">48</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Priority Breakdown */}
      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-900">Priority Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] flex flex-col">
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={priorityData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                  {priorityData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-1 gap-1 mt-2">
            {priorityData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600">{item.name}</span>
                </div>
                <span className="font-semibold text-slate-900">{item.percentage} ({item.value})</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};