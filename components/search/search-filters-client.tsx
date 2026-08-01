'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Loader2, SlidersHorizontal, X, Trophy, RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { computeRanks, RawEvaluationRow } from '@/lib/data';
import { DEPARTMENTS, MONTH_NAMES, Department } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface EvalRow {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  department_marks: number;
  hr_marks: number;
  safety_marks: number;
  negative_marks: number;
  total_marks: number;
  remarks: string | null;
  employees: {
    employee_id: string;
    name: string;
    photo: string | null;
    department: Department;
    designation: string | null;
    joining_date: string;
    status: 'Active' | 'Inactive';
  };
}

interface ResultRow {
  evaluation_id: string;
  employee_code: string;
  name: string;
  photo: string | null;
  department: Department;
  designation: string | null;
  joining_date: string;
  status: 'Active' | 'Inactive';
  month: number;
  year: number;
  department_marks: number;
  hr_marks: number;
  safety_marks: number;
  negative_marks: number;
  total_marks: number;
  remarks: string | null;
  rank: number;
}

const ALL = 'all';
const pageSize = 10;

export function SearchFiltersClient() {
  const now = new Date();
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState<string>(ALL);
  const [month, setMonth] = useState<string>(ALL);
  const [year, setYear] = useState<string>(ALL);
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('evaluations')
        .select('*, employees!inner(employee_id, name, photo, department, designation, joining_date, status)')
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as unknown as EvalRow[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const years = useMemo(() => {
    const set = new Set<number>();
    rows.forEach((r) => set.add(r.year));
    set.add(now.getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [rows, now]);

  const results = useMemo<ResultRow[]>(() => {
    const s = search.trim().toLowerCase();
    const min = minScore === '' ? null : Number(minScore);
    const max = maxScore === '' ? null : Number(maxScore);

    const filtered = rows.filter((r) => {
      const matchSearch = !s
        || r.employees.name.toLowerCase().includes(s)
        || r.employees.employee_id.toLowerCase().includes(s)
        || (r.employees.designation ?? '').toLowerCase().includes(s);
      const matchDept = department === ALL || r.employees.department === department;
      const matchMonth = month === ALL || r.month === Number(month);
      const matchYear = year === ALL || r.year === Number(year);
      const total = Number(r.total_marks);
      const matchMin = min === null || total >= min;
      const matchMax = max === null || total <= max;
      return matchSearch && matchDept && matchMonth && matchYear && matchMin && matchMax;
    });

    // Rank within each month/year period so ranks stay meaningful even when
    // results span multiple periods.
    const groups: Record<string, RawEvaluationRow[]> = {};
    for (const r of filtered) {
      const key = `${r.year}-${r.month}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push({
        evaluation_id: r.id,
        employee_id: r.employee_id,
        employee_code: r.employees.employee_id,
        name: r.employees.name,
        photo: r.employees.photo,
        department: r.employees.department,
        designation: r.employees.designation,
        joining_date: r.employees.joining_date,
        department_marks: r.department_marks,
        hr_marks: r.hr_marks,
        safety_marks: r.safety_marks,
        negative_marks: r.negative_marks,
        total_marks: r.total_marks,
        remarks: r.remarks,
      });
    }

    const rankedByKey: Record<string, ReturnType<typeof computeRanks>> = {};
    Object.entries(groups).forEach(([key, groupRows]) => {
      rankedByKey[key] = computeRanks(groupRows);
    });

    const out: ResultRow[] = [];
    for (const r of filtered) {
      const key = `${r.year}-${r.month}`;
      const ranked = rankedByKey[key].find((x) => x.evaluation_id === r.id)!;
      out.push({
        evaluation_id: r.id,
        employee_code: r.employees.employee_id,
        name: r.employees.name,
        photo: r.employees.photo,
        department: r.employees.department,
        designation: r.employees.designation,
        joining_date: r.employees.joining_date,
        status: r.employees.status,
        month: r.month,
        year: r.year,
        department_marks: r.department_marks,
        hr_marks: r.hr_marks,
        safety_marks: r.safety_marks,
        negative_marks: r.negative_marks,
        total_marks: r.total_marks,
        remarks: r.remarks,
        rank: ranked.rank,
      });
    }

    out.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      if (b.month !== a.month) return b.month - a.month;
      return Number(a.rank) - Number(b.rank);
    });

    return out;
  }, [rows, search, department, month, year, minScore, maxScore]);

  useEffect(() => { setPage(0); }, [search, department, month, year, minScore, maxScore]);

  const pageCount = Math.ceil(results.length / pageSize) || 1;
  const currentData = results.slice(page * pageSize, (page + 1) * pageSize);

  const activeFilterCount = [
    search.trim() !== '',
    department !== ALL,
    month !== ALL,
    year !== ALL,
    minScore !== '',
    maxScore !== '',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSearch('');
    setDepartment(ALL);
    setMonth(ALL);
    setYear(ALL);
    setMinScore('');
    setMaxScore('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Search &amp; Filters</h1>
        <p className="text-sm text-muted-foreground">
          Find any employee&apos;s evaluation record by name, department, period, or score
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-xs">{activeFilterCount} active</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, employee ID, or designation..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All Departments</SelectItem>
                  {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All Months</SelectItem>
                  {MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All Years</SelectItem>
                  {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Min Score</Label>
              <Input type="number" min={0} max={100} placeholder="0" value={minScore} onChange={(e) => setMinScore(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Max Score</Label>
              <Input type="number" min={0} max={100} placeholder="100" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
            </div>

            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={resetFilters} disabled={activeFilterCount === 0}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-lg">Results</CardTitle>
            <CardDescription>{results.length} evaluation record{results.length === 1 ? '' : 's'} found</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-60 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : results.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-center">
              <Search className="mb-2 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No records match your filters</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Dept</TableHead>
                      <TableHead className="text-right">HR</TableHead>
                      <TableHead className="text-right">Safety</TableHead>
                      <TableHead className="text-right">Negative</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentData.map((r) => (
                      <TableRow key={r.evaluation_id}>
                        <TableCell>
                          <Badge
                            variant={r.rank <= 3 ? 'default' : 'outline'}
                            className={r.rank === 1 ? 'bg-gold text-white' : r.rank === 2 ? 'bg-silver text-white' : r.rank === 3 ? 'bg-bronze text-white' : ''}
                          >
                            {r.rank === 1 ? <Trophy className="h-3 w-3" /> : r.rank}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={r.photo ?? undefined} />
                              <AvatarFallback className="bg-muted text-xs">{getInitials(r.name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{r.name}</div>
                              <div className="text-xs text-muted-foreground">{r.employee_code}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{r.department}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{MONTH_NAMES[r.month - 1].slice(0, 3)} {r.year}</TableCell>
                        <TableCell className="text-right">{Number(r.department_marks)}</TableCell>
                        <TableCell className="text-right">{Number(r.hr_marks)}</TableCell>
                        <TableCell className="text-right">{Number(r.safety_marks)}</TableCell>
                        <TableCell className="text-right text-destructive">{Number(r.negative_marks) > 0 ? `-${Number(r.negative_marks)}` : '0'}</TableCell>
                        <TableCell className="text-right font-bold">{Number(r.total_marks)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Page {page + 1} of {pageCount}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getInitials(name: string): string {
  return name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
}
