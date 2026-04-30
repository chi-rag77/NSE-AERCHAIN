import React from "react";
import { cn } from "@/lib/utils";

interface SegmentProps {
  label: string;
  count: number;
  percentage: number;
  color: string;
  onClick?: () => void;
}

const Segment = ({ label, count, percentage, color, onClick }: SegmentProps) => (
  <button
    onClick={onClick}
    className={cn(
      "h-full flex flex-col justify-center px-4 transition-all hover:brightness-95 first:rounded-l-xl last:rounded-r-xl",
      color
    )}
    style={{ width: `${percentage}%` }}
  >
    <span className="text-xs font-semibold text-white/80 uppercase tracking-wider truncate">
      {label}
    </span>
    <span className="text-lg font-bold text-white">{count}</span>
  </button>
);

export const ServiceStatusBar = () => {
  const data = [
    { label: "On Track", count: 42, percentage: 65, color: "bg-emerald-500" },
    { label: "Attention Needed", count: 12, percentage: 20, color: "bg-amber-500" },
    { label: "Immediate Action", count: 8, percentage: 15, color: "bg-rose-500" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Service Status Overview</h3>
        <span className="text-xs text-muted-foreground">Last updated: Just now</span>
      </div>
      <div className="h-16 w-full flex shadow-lg shadow-primary/5">
        {data.map((segment) => (
          <Segment key={segment.label} {...segment} />
        ))}
      </div>
    </div>
  );
};