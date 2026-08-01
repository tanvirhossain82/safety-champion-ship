'use client';

import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';
import { AuditLogClient } from '@/components/audit-log/audit-log-client';

export default function AuditLogPage() {
  return (
    <RouteGuard roles={['admin']}>
      <AppShell>
        <AuditLogClient />
      </AppShell>
    </RouteGuard>
  );
}
