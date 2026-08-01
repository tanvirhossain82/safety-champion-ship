'use client';

import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';
import { SearchFiltersClient } from '@/components/search/search-filters-client';

export default function SearchPage() {
  return (
    <RouteGuard>
      <AppShell>
        <SearchFiltersClient />
      </AppShell>
    </RouteGuard>
  );
}
