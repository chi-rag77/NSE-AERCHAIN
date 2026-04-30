import React from 'react';
import { cn } from '@/lib/utils';

const ServiceStatusBar = () => {
  const segments = [
    { label: 'On Track', count: 18, color: 'bg-emerald-500', width: '60%' },
    { label: 'Attention Needed', count: 5, color: 'bg-amber-500', width: '25%' },
    { label: 'Immediate Action', count: 2, color: 'bg-rose-500', width: '15%' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-lg font-semibold">Service Status</h2>
          <p className="text-sm text-muted-foreground">Real-time SLA distribution for NSE</p>
        </div>
        <div className="flex gap-4">
          {segments.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className={cn("h-2 w-2 rounded-full", s.color)}></div>
              <span className="text-xs font-medium">{s.label}: {s.count}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="h-3 w-full bg-muted rounded-full overflow-hidden flex">
        {segments.map((s) => (
          <div 
            key={s.label} 
            className={cn("h-full transition-all hover:opacity-80 cursor-pointer", s.color)} 
            style={{ width: s.width }}
            title={`${s.label}: ${s.count} tickets`}
          ></div>
        ))}
      </div>
    </div>
  );
};

export default ServiceStatusBar;