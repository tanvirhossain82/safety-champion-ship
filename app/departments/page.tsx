'use client';

import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';
import { DepartmentsClient } from '@/components/departments/departments-client';

export default function DepartmentsPage() {
  return (
    <RouteGuard>
      <AppShell>
        <DepartmentsClient />
      </AppShell>
    </RouteGuard>
  );
}
