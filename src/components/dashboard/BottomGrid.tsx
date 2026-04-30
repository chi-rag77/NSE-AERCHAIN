import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const BottomGrid = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Top Recurring Issues */}
      <Card className="lg:col-span-2 border-none shadow-sm bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-900">Top Recurring Issues</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="text-[10px] font-bold uppercase text-slate-500">Issue</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-slate-500">Category</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-slate-500">Total</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-slate-500">Open</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-slate-500">Trend</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { name: "Vendor duplication issue", cat: "Data", total: 12, open: 7, trend: "+20%", up: true },
                { name: "PR approval workflow delay", cat: "Workflow", total: 9, open: 5, trend: "+12%", up: true },
                { name: "PO error on save", cat: "Bug", total: 7, open: 3, trend: "-8%", up: false },
                { name: "Email not triggered", cat: "Integration", total: 6, open: 2, trend: "+20%", up: true },
              ].map((issue) => (
                <TableRow key={issue.name} className="border-slate-50">
                  <TableCell className="text-xs font-medium text-slate-900">{issue.name}</TableCell>
                  <TableCell className="text-xs text-slate-500">{issue.cat}</TableCell>
                  <TableCell className="text-xs font-semibold text-slate-700">{issue.total}</TableCell>
                  <TableCell className="text-xs font-semibold text-slate-700">{issue.open}</TableCell>
                  <TableCell>
                    <div className={cn(
                      "flex items-center gap-1 text-[10px] font-bold",
                      issue.up ? "text-rose-500" : "text-emerald-500"
                    )}>
                      {issue.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {issue.trend}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] text-blue-600 hover:text-blue-700">View Tickets</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Agent Performance */}
      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-900">Agent Performance (Top 5)</CardTitle>
          <Button variant="link" className="text-[10px] h-auto p-0 text-blue-600">View All</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-0">
            {[
              { name: "Ravi Kumar", resolved: 152, sla: 96 },
              { name: "Asha Nair", resolved: 138, sla: 94 },
              { name: "Suresh P", resolved: 128, sla: 92 },
              { name: "Meena N", resolved: 112, sla: 91 },
              { name: "Vikas Singh", resolved: 98, sla: 89 },
            ].map((agent) => (
              <div key={agent.name} className="flex items-center gap-3 p-3 border-b border-slate-50 last:border-0">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${agent.name}`} />
                  <AvatarFallback>{agent.name[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-slate-900">{agent.name}</span>
                    <span className="text-[10px] font-bold text-slate-500">{agent.resolved} Resolved</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${agent.sla}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-emerald-600">{agent.sla}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};