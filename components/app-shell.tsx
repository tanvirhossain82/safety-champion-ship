'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, ClipboardCheck, Trophy, FileBarChart,
  ShieldAlert, Shield, ScrollText, LogOut, Menu, X, ChevronRight, Building2, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { UserRole, ROLE_LABELS, ROLE_PERMISSIONS } from '@/lib/types';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  permission?: keyof typeof ROLE_PERMISSIONS[UserRole];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/departments', label: 'Departments', icon: Building2 },
  { href: '/admin', label: 'Admin', icon: ShieldCheck, permission: 'canManageEmployees' },
  { href: '/evaluation', label: 'Evaluation', icon: ClipboardCheck },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/reports', label: 'Reports', icon: FileBarChart, permission: 'canViewReports' },
  { href: '/negative-reasons', label: 'Negative Reasons', icon: ShieldAlert, permission: 'canManageNegativeReasons' },
  { href: '/audit-log', label: 'Audit Log', icon: ScrollText, permission: 'canViewAuditLog' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  const handleSignOut = async () => {
    await signOut();
    router.replace('/');
  };

  const initials = (profile?.full_name || profile?.email || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const roleBadgeColor: Record<UserRole, string> = {
    admin: 'bg-primary/10 text-primary border-primary/20',
    hr: 'bg-chart-3/10 text-chart-3 border-chart-3/20',
    safety: 'bg-accent/10 text-accent border-accent/20',
    dept_head: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar - desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card lg:flex">
        <SidebarContent
          items={visibleItems}
          pathname={pathname}
          profile={profile}
          initials={initials}
          roleBadgeColor={roleBadgeColor}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* Sidebar - mobile */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card lg:hidden animate-slide-in-right">
            <SidebarContent
              items={visibleItems}
              pathname={pathname}
              profile={profile}
              initials={initials}
              roleBadgeColor={roleBadgeColor}
              onSignOut={handleSignOut}
              onClose={() => setMobileOpen(false)}
            />
          </aside>
        </>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card/80 px-4 backdrop-blur-md lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <Shield className="h-4 w-4" />
            </div>
            <span className="font-bold text-sm">Safety Championship</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden items-center gap-3 border-l pl-3 sm:flex">
              <Avatar className="h-9 w-9">
                <AvatarImage src={undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="text-right">
                <div className="text-sm font-medium leading-tight">{profile?.full_name || 'User'}</div>
                <div className="text-xs text-muted-foreground">{profile?.email}</div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  items, pathname, profile, initials, roleBadgeColor, onSignOut, onClose,
}: {
  items: NavItem[];
  pathname: string;
  profile: ReturnType<typeof useAuth>['profile'];
  initials: string;
  roleBadgeColor: Record<UserRole, string>;
  onSignOut: () => void;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-md">
          <Shield className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold leading-tight">Safety Championship</div>
          <div className="text-xs text-muted-foreground">Management System</div>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight className="h-4 w-4" />}
            </Link>
          );
        })}
      </nav>

      {profile && (
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{profile.full_name || 'User'}</div>
              <Badge variant="outline" className={cn('mt-0.5 text-[10px]', roleBadgeColor[profile.role])}>
                {ROLE_LABELS[profile.role]}
              </Badge>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onSignOut} className="mt-3 w-full justify-start text-muted-foreground">
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </Button>
        </div>
      )}
    </>
  );
}
