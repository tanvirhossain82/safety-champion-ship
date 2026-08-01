'use client';

import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';
import { AddEmployeeClient } from '@/components/employees/add-employee-client';

export default function AddEmployeePage() {
  return (
    <RouteGuard roles={['admin']}>
      <AppShell>
        <AddEmployeeClient />
      </AppShell>
    </RouteGuard>
  );
}
