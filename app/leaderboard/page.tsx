'use client';

import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';
import { LeaderboardClient } from '@/components/leaderboard/leaderboard-client';

export default function LeaderboardPage() {
  return (
    <RouteGuard>
      <AppShell>
        <LeaderboardClient />
      </AppShell>
    </RouteGuard>
  );
}
