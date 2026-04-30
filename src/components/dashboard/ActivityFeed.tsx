import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  MessageSquare, 
  UserPlus, 
  CheckCircle2, 
  AlertCircle, 
  ArrowUpRight,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

const activities = [
  {
    id: 1,
    type: "created",
    title: "Ticket NSE-12345 created",
    subtitle: "by NSE - Procurement",
    time: "2m ago",
    icon: MessageSquare,
    color: "bg-blue-500",
  },
  {
    id: 2,
    type: "sla",
    title: "SLA approaching for",
    subtitle: "Ticket NSE-12344",
    time: "7m ago",
    icon: Clock,
    color: "bg-orange-500",
  },
  {
    id: 3,
    type: "reply",
    title: "Asha Nair replied to",
    subtitle: "Ticket NSE-12340",
    time: "10m ago",
    icon: MessageSquare,
    color: "bg-emerald-500",
  },
  {
    id: 4,
    type: "escalation",
    title: "Ticket NSE-12343 escalated",
    subtitle: "to Level 2",
    time: "12m ago",
    icon: ArrowUpRight,
    color: "bg-rose-500",
  },
  {
    id: 5,
    type: "assignment",
    title: "Ravi Kumar assigned to",
    subtitle: "Ticket NSE-12341",
    time: "15m ago",
    icon: UserPlus,
    color: "bg-purple-500",
  },
  {
    id: 6,
    type: "sla_breach",
    title: "SLA breached for",
    subtitle: "Ticket NSE-12340",
    time: "22m ago",
    icon: AlertCircle,
    color: "bg-orange-500",
  },
  {
    id: 7,
    type: "resolved",
    title: "Ticket NSE-12338 resolved",
    time: "25m ago",
    icon: CheckCircle2,
    color: "bg-blue-500",
  }
];

export const ActivityFeed = () => {
  return (
    <Card className="border-none shadow-sm bg-white h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-900">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="space-y-1">
          {activities.map((activity) => (
            <div key={activity.id} className="flex gap-3 p-4 hover:bg-slate-50 transition-colors cursor-pointer group">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-white",
                activity.color
              )}>
                <activity.icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-primary transition-colors">
                  {activity.title}
                </p>
                {activity.subtitle && (
                  <p className="text-[11px] text-slate-500 truncate">{activity.subtitle}</p>
                )}
                <p className="text-[10px] text-slate-400 mt-0.5">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t">
          <Button variant="ghost" className="w-full text-xs text-slate-500 hover:text-slate-900">
            View All Activities
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};