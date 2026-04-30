import React from 'react';
import { Search, Bell, User, LayoutDashboard, Ticket, Activity, AlertTriangle, BarChart3, Settings } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const Header = () => {
  const location = useLocation();
  
  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Tickets', path: '/tickets', icon: Ticket },
    { name: 'SLA Monitor', path: '/sla', icon: Activity },
    { name: 'Escalations', path: '/escalations', icon: AlertTriangle },
    { name: 'Analytics', path: '/analytics', icon: BarChart3 },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-8">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xl">A</span>
            </div>
            <span className="font-bold text-lg tracking-tight hidden md:block">Aerchain <span className="text-muted-foreground font-medium">Support</span></span>
          </div>
          
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all hover:bg-accent",
                  location.pathname === item.path ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                )}
              >
                <item.icon size={16} />
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative hidden md:block w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input 
              placeholder="Search tickets..." 
              className="pl-10 bg-muted/50 border-none rounded-full focus-visible:ring-1"
            />
          </div>
          
          <Button variant="ghost" size="icon" className="rounded-full relative">
            <Bell size={20} />
            <span className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full border-2 border-background"></span>
          </Button>
          
          <div className="flex items-center gap-3 pl-2 border-l">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium leading-none">NSE Command</p>
              <p className="text-xs text-muted-foreground">Support Lead</p>
            </div>
            <Avatar className="h-9 w-9 border-2 border-primary/10">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>SC</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;