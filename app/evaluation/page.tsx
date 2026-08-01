'use client';

import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';
import { EvaluationClient } from '@/components/evaluation/evaluation-client';

export default function EvaluationPage() {
  return (
    <RouteGuard>
      <AppShell>
        <EvaluationClient />
      </AppShell>
    </RouteGuard>
  );
}
