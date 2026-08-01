'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScrollText, Loader2, Shield, Activity } from 'lucide-react';
import { fetchAuditLogs } from '@/lib/data';
import { AuditLog } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-500/10 text-green-600 border-green-500/20',
  UPDATE: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  DELETE: 'bg-red-500/10 text-red-600 border-red-500/20',
};

export function AuditLogClient() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLogs(200);
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Track all create, update, and delete actions</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-600"><Activity className="h-5 w-5" /></div>
            <div><div className="text-xl font-bold">{logs.filter((l) => l.action === 'CREATE').length}</div><div className="text-xs text-muted-foreground">Creates</div></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600"><ScrollText className="h-5 w-5" /></div>
            <div><div className="text-xl font-bold">{logs.filter((l) => l.action === 'UPDATE').length}</div><div className="text-xs text-muted-foreground">Updates</div></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-600"><Shield className="h-5 w-5" /></div>
            <div><div className="text-xl font-bold">{logs.filter((l) => l.action === 'DELETE').length}</div><div className="text-xs text-muted-foreground">Deletes</div></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity History</CardTitle>
          <CardDescription>Most recent {logs.length} actions</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : logs.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-center">
              <ScrollText className="mb-2 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No activity recorded yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="bg-muted text-[10px]">{getInitials(log.actor_email || '?')}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{log.actor_email || 'Unknown'}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={ACTION_COLORS[log.action] || ''}>{log.action}</Badge></TableCell>
                      <TableCell className="capitalize">{log.entity.replace('_', ' ')}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{log.details}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(new Date(log.created_at), 'dd MMM yyyy, HH:mm')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getInitials(email: string): string {
  return email.split('@')[0].split('.').map((s) => s[0]).slice(0, 2).join('').toUpperCase() || '?';
}
