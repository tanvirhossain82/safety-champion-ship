'use client';

import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';
import { ReportsClient } from '@/components/reports/reports-client';

export default function ReportsPage() {
  return (
    <RouteGuard>
      <AppShell>
        <ReportsClient />
      </AppShell>
    </RouteGuard>
  );
}
