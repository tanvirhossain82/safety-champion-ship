'use client';

import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';
import { DepartmentDetailClient } from '@/components/departments/department-detail-client';

export default function DepartmentDetailPage({ params }: { params: { code: string } }) {
  return (
    <RouteGuard>
      <AppShell>
        <DepartmentDetailClient code={params.code} />
      </AppShell>
    </RouteGuard>
  );
}
