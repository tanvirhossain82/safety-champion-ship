'use client';

import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';
import { EmployeesClient } from '@/components/employees/employees-client';

export default function EmployeesPage() {
  return (
    <RouteGuard roles={['admin']}>
      <AppShell>
        <EmployeesClient />
      </AppShell>
    </RouteGuard>
  );
}
