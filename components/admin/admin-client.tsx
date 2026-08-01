'use client';

import { useState } from 'react';
import { ShieldCheck, Users, ChevronRight } from 'lucide-react';
import { EmployeesClient } from '@/components/employees/employees-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SubModule = 'employees';

interface SubModuleDef {
  key: SubModule;
  label: string;
  description: string;
  icon: React.ElementType;
}

const SUB_MODULES: SubModuleDef[] = [
  {
    key: 'employees',
    label: 'Add Employee',
    description: 'Add, edit and bulk-import employees by department',
    icon: Users,
  },
];

export function AdminClient() {
  const [active, setActive] = useState<SubModule>('employees');

  return (
    <div className="space-y-6">
      {/* Module header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Manage system modules and configuration</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Sub-module navigation */}
        <aside className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sub-modules
          </p>
          {SUB_MODULES.map((m) => {
            const Icon = m.icon;
            const isActive = active === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setActive(m.key)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all',
                  isActive
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border bg-card hover:border-primary/40 hover:bg-muted/50',
                )}
              >
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.description}</div>
                </div>
                <ChevronRight
                  className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground/50')}
                />
              </button>
            );
          })}
        </aside>

        {/* Active sub-module content */}
        <section>
          {active === 'employees' && (
            <Card>
              <CardContent className="p-4 sm:p-6">
                <EmployeesClient />
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
