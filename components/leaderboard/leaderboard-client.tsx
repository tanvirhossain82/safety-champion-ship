'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Trophy, Loader2, ArrowUp, ArrowDown, ArrowUpDown, Search, Calendar,
  Crown, Medal, Award,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { fetchRankedEvaluations, RankedRow } from '@/lib/data';
import { DEPARTMENTS, MONTH_NAMES } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type SortKey = 'rank' | 'name' | 'employee_code' | 'department' | 'department_marks' | 'hr_marks' | 'safety_marks' | 'negative_marks' | 'total_marks';
type SortDir = 'asc' | 'desc';

export function LeaderboardClient() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<RankedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const pageSize = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRankedEvaluations(month, year);
      setRows(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let r = rows;
    const s = search.toLowerCase();
    if (s) r = r.filter((row) => row.name.toLowerCase().includes(s) || row.employee_code.toLowerCase().includes(s));
    if (deptFilter !== 'all') r = r.filter((row) => row.department === deptFilter);
    return r;
  }, [rows, search, deptFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'employee_code') cmp = a.employee_code.localeCompare(b.employee_code);
      else if (sortKey === 'department') cmp = a.department.localeCompare(b.department);
      else if (sortKey === 'rank') cmp = a.rank - b.rank;
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.ceil(sorted.length / pageSize) || 1;
  const currentData = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'rank' || key === 'total_marks' ? 'asc' : 'asc'); }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="ml-1 inline h-3 w-3" /> : <ArrowDown className="ml-1 inline h-3 w-3" />;
  };

  const top3 = sorted.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-sm text-muted-foreground">Monthly safety performance rankings</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={String(month)} onValueChange={(v) => { setMonth(Number(v)); setPage(0); }}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setPage(0); }}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Podium preview */}
      {top3.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {top3.map((row) => {
            const config = {
              1: { label: 'Champion', icon: Crown, cls: 'border-gold/50 bg-gold/5', badge: 'bg-gold text-white' },
              2: { label: 'Runner-up', icon: Medal, cls: 'border-silver/50 bg-silver/5', badge: 'bg-silver text-white' },
              3: { label: '3rd Position', icon: Award, cls: 'border-bronze/50 bg-bronze/5', badge: 'bg-bronze text-white' },
            }[row.rank]!;
            const Icon = config.icon;
            return (
              <Card key={row.evaluation_id} className={`${config.cls} ${row.rank === 1 ? 'md:scale-[1.03]' : ''}`}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${config.badge} shadow-sm`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <Avatar className="h-12 w-12 border-2 border-border">
                    <AvatarImage src={row.photo ?? undefined} />
                    <AvatarFallback className="bg-muted text-xs">{getInitials(row.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.department}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold">{Number(row.total_marks)}</div>
                    <div className="text-xs text-muted-foreground">marks</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name or ID..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <Select value={deptFilter} onValueChange={(v) => { setDeptFilter(v); setPage(0); }}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-primary" />
            {sorted.length} {sorted.length === 1 ? 'Entry' : 'Entries'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : currentData.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-center">
              <Trophy className="mb-2 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No evaluations for {MONTH_NAMES[month - 1]} {year}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('rank')}><SortIcon column="rank" />Rank</TableHead>
                      <TableHead>Photo</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('employee_code')}><SortIcon column="employee_code" />Emp ID</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('name')}><SortIcon column="name" />Name</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('department')}><SortIcon column="department" />Department</TableHead>
                      <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('department_marks')}><SortIcon column="department_marks" />Dept</TableHead>
                      <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('hr_marks')}><SortIcon column="hr_marks" />HR</TableHead>
                      <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('safety_marks')}><SortIcon column="safety_marks" />Safety</TableHead>
                      <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('negative_marks')}><SortIcon column="negative_marks" />Negative</TableHead>
                      <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('total_marks')}><SortIcon column="total_marks" />Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentData.map((row) => (
                      <TableRow key={row.evaluation_id} className="hover:bg-muted/50">
                        <TableCell>
                          <RankBadge rank={row.rank} />
                        </TableCell>
                        <TableCell>
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={row.photo ?? undefined} />
                            <AvatarFallback className="bg-muted text-xs">{getInitials(row.name)}</AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell className="font-medium text-xs">{row.employee_code}</TableCell>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{row.department}</Badge></TableCell>
                        <TableCell className="text-right">{Number(row.department_marks)}</TableCell>
                        <TableCell className="text-right">{Number(row.hr_marks)}</TableCell>
                        <TableCell className="text-right">{Number(row.safety_marks)}</TableCell>
                        <TableCell className="text-right text-destructive">{Number(row.negative_marks) > 0 ? `-${Number(row.negative_marks)}` : '0'}</TableCell>
                        <TableCell className="text-right font-bold">{Number(row.total_marks)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {pageCount > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">Page {page + 1} of {pageCount}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-xs font-bold text-white shadow-sm">{rank}</div>;
  if (rank === 2) return <div className="flex h-7 w-7 items-center justify-center rounded-full bg-silver text-xs font-bold text-white shadow-sm">{rank}</div>;
  if (rank === 3) return <div className="flex h-7 w-7 items-center justify-center rounded-full bg-bronze text-xs font-bold text-white shadow-sm">{rank}</div>;
  return <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{rank}</div>;
}

function getInitials(name: string): string {
  return name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
}
