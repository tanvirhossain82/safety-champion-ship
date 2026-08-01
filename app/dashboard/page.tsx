'use client';

import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

export default function DashboardPage() {
  const { profile } = useAuth();
  return (
    <RouteGuard>
      <AppShell>
        <DashboardClient />
      </AppShell>
    </RouteGuard>
  );
}
