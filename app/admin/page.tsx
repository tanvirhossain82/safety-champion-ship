'use client';

import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';
import { AdminClient } from '@/components/admin/admin-client';

export default function AdminPage() {
  return (
    <RouteGuard roles={['admin']}>
      <AppShell>
        <AdminClient />
      </AppShell>
    </RouteGuard>
  );
}
