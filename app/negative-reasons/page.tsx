'use client';

import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';
import { NegativeReasonsClient } from '@/components/negative-reasons/negative-reasons-client';

export default function NegativeReasonsPage() {
  return (
    <RouteGuard roles={['admin']}>
      <AppShell>
        <NegativeReasonsClient />
      </AppShell>
    </RouteGuard>
  );
}
