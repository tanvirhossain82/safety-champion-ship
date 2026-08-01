'use client';

import {
  FileBarChart, Loader2, FileText, FileSpreadsheet, Printer, Trophy,
  TrendingUp, TrendingDown, Users, BarChart3,
} from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { fetchRankedEvaluations, RankedRow } from '@/lib/data';
import { Employee, Evaluation, DEPARTMENTS, MONTH_NAMES } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { toast } from '@/hooks/use-toast';

type ReportTab = 'monthly' | 'department' | 'employee' | 'top10' | 'lowest';

export function ReportsClient() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [tab, setTab] = useState<ReportTab>('monthly');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [ranked, setRanked] = useState<RankedRow[]>([]);
  const [allEvaluations, setAllEvaluations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, rankData, evalRes] = await Promise.all([
        supabase.from('employees').select('*'),
        fetchRankedEvaluations(month, year),
        supabase.from('evaluations').select('*, employees!inner(employee_id, name, department, photo, joining_date)').order('year', { ascending: false }).order('month', { ascending: false }),
      ]);
      if (empRes.data) setEmployees(empRes.data as Employee[]);
      setRanked(rankData);
      if (evalRes.data) setAllEvaluations(evalRes.data as any[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  // Department-wise ranking
  const deptRanking = useMemo(() => {
    return DEPARTMENTS.map((d) => {
      const rows = ranked.filter((r) => r.department === d);
      const avg = rows.length > 0 ? Math.round((rows.reduce((s, r) => s + Number(r.total_marks), 0) / rows.length) * 10) / 10 : 0;
      const max = rows.length > 0 ? Math.max(...rows.map((r) => Number(r.total_marks))) : 0;
      return { dept: d, employees: rows.length, avg, max, top: rows[0] ?? null };
    }).sort((a, b) => b.avg - a.avg);
  }, [ranked]);

  // Employee performance history
  const employeeHistory = useMemo(() => {
    const byEmp: Record<string, { employee: any; evaluations: any[] }> = {};
    for (const ev of allEvaluations) {
      const key = ev.employee_id;
      if (!byEmp[key]) byEmp[key] = { employee: ev.employees, evaluations: [] };
      byEmp[key].evaluations.push(ev);
    }
    return Object.values(byEmp).sort((a, b) => {
      const aAvg = a.evaluations.length > 0 ? a.evaluations.reduce((s: number, e: any) => s + Number(e.total_marks), 0) / a.evaluations.length : 0;
      const bAvg = b.evaluations.length > 0 ? b.evaluations.reduce((s: number, e: any) => s + Number(e.total_marks), 0) / b.evaluations.length : 0;
      return bAvg - aAvg;
    });
  }, [allEvaluations]);

  const top10 = ranked.slice(0, 10);
  const lowest = ranked.length > 0 ? [...ranked].sort((a, b) => Number(a.total_marks) - Number(b.total_marks)).slice(0, 10) : [];

  const exportPDF = async (data: any[], title: string, columns: { header: string; key: string }[]) => {
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(16);
      doc.text('Safety Championship Management System', 14, 18);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`${title} — ${MONTH_NAMES[month - 1]} ${year}`, 14, 26);
      doc.setTextColor(0);

      autoTable(doc, {
        startY: 32,
        head: [columns.map((c) => c.header)],
        body: data.map((row) => columns.map((c) => {
          const val = c.key.split('.').reduce((obj, k) => obj?.[k], row);
          return val !== undefined && val !== null ? String(val) : '';
        })),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 64, 175], textColor: 255 },
        alternateRowStyles: { fillColor: [240, 245, 255] },
      });

      doc.save(`safety-${tab}-${year}-${month}.pdf`);
      toast({ title: 'PDF exported' });
    } catch (e: any) {
      toast({ title: 'PDF export failed', description: e.message, variant: 'destructive' });
    }
  };

  const exportExcel = async (data: any[], title: string, columns: { header: string; key: string }[]) => {
    try {
      const XLSX = await import('xlsx');
      const rows = data.map((row) => {
        const obj: Record<string, any> = {};
        columns.forEach((c) => {
          const val = c.key.split('.').reduce((o, k) => o?.[k], row);
          obj[c.header] = val !== undefined && val !== null ? val : '';
        });
        return obj;
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 28));
      XLSX.writeFile(wb, `safety-${tab}-${year}-${month}.xlsx`);
      toast({ title: 'Excel exported' });
    } catch (e: any) {
      toast({ title: 'Excel export failed', description: e.message, variant: 'destructive' });
    }
  };

  const printReport = () => {
    window.print();
  };

  const monthlyCols = [
    { header: 'Rank', key: 'rank' },
    { header: 'Emp ID', key: 'employee_code' },
    { header: 'Name', key: 'name' },
    { header: 'Department', key: 'department' },
    { header: 'Dept Marks', key: 'department_marks' },
    { header: 'HR Marks', key: 'hr_marks' },
    { header: 'Safety Marks', key: 'safety_marks' },
    { header: 'Negative', key: 'negative_marks' },
    { header: 'Total', key: 'total_marks' },
  ];

  const deptCols = [
    { header: 'Rank', key: '_rank' },
    { header: 'Department', key: 'dept' },
    { header: 'Employees Evaluated', key: 'employees' },
    { header: 'Average Score', key: 'avg' },
    { header: 'Max Score', key: 'max' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Generate and export performance reports</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Export buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => exportPDF(
            tab === 'monthly' ? ranked : tab === 'department' ? deptRanking.map((d, i) => ({ ...d, _rank: i + 1 })) : tab === 'top10' ? top10 : tab === 'lowest' ? lowest : [],
            reportTitle(tab),
            tab === 'department' ? deptCols : monthlyCols
          )}
        >
          <FileText className="mr-2 h-4 w-4" /> Export PDF
        </Button>
        <Button
          variant="outline"
          onClick={() => exportExcel(
            tab === 'monthly' ? ranked : tab === 'department' ? deptRanking.map((d, i) => ({ ...d, _rank: i + 1 })) : tab === 'top10' ? top10 : tab === 'lowest' ? lowest : [],
            reportTitle(tab),
            tab === 'department' ? deptCols : monthlyCols
          )}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
        </Button>
        <Button variant="outline" onClick={printReport}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as ReportTab)}>
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
            <TabsTrigger value="monthly"><Trophy className="mr-1 h-4 w-4" /> Monthly</TabsTrigger>
            <TabsTrigger value="department"><Users className="mr-1 h-4 w-4" /> Department</TabsTrigger>
            <TabsTrigger value="employee"><BarChart3 className="mr-1 h-4 w-4" /> Employee</TabsTrigger>
            <TabsTrigger value="top10"><TrendingUp className="mr-1 h-4 w-4" /> Top 10</TabsTrigger>
            <TabsTrigger value="lowest"><TrendingDown className="mr-1 h-4 w-4" /> Lowest</TabsTrigger>
          </TabsList>

          {/* Monthly Ranking */}
          <TabsContent value="monthly" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Monthly Ranking — {MONTH_NAMES[month - 1]} {year}</CardTitle>
                <CardDescription>{ranked.length} employees evaluated</CardDescription>
              </CardHeader>
              <CardContent>
                {ranked.length === 0 ? <EmptyState /> : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Emp ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Dept</TableHead>
                          <TableHead className="text-right">Dept</TableHead>
                          <TableHead className="text-right">HR</TableHead>
                          <TableHead className="text-right">Safety</TableHead>
                          <TableHead className="text-right">Neg</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ranked.map((r) => (
                          <TableRow key={r.evaluation_id}>
                            <TableCell>
                              <Badge variant={r.rank <= 3 ? 'default' : 'outline'} className={r.rank === 1 ? 'bg-gold text-white' : r.rank === 2 ? 'bg-silver text-white' : r.rank === 3 ? 'bg-bronze text-white' : ''}>{r.rank}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">{r.employee_code}</TableCell>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell><Badge variant="secondary" className="text-xs">{r.department}</Badge></TableCell>
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
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Department-wise */}
          <TabsContent value="department" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Department-wise Ranking — {MONTH_NAMES[month - 1]} {year}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rank</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right">Evaluated</TableHead>
                        <TableHead className="text-right">Average</TableHead>
                        <TableHead className="text-right">Max Score</TableHead>
                        <TableHead>Top Performer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deptRanking.map((d, i) => (
                        <TableRow key={d.dept}>
                          <TableCell><Badge variant={i === 0 ? 'default' : 'outline'}>{i + 1}</Badge></TableCell>
                          <TableCell className="font-medium">{d.dept}</TableCell>
                          <TableCell className="text-right">{d.employees}</TableCell>
                          <TableCell className="text-right font-semibold">{d.avg}</TableCell>
                          <TableCell className="text-right">{d.max}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{d.top?.name ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            {deptRanking.some((d) => d.avg > 0) && (
              <Card>
                <CardHeader><CardTitle className="text-lg">Department Score Chart</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={deptRanking}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="dept" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      <Legend />
                      <Bar dataKey="avg" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} name="Average Score" />
                      <Bar dataKey="max" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} name="Max Score" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Employee Performance History */}
          <TabsContent value="employee" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Employee Performance History</CardTitle>
                <CardDescription>All evaluations across all months</CardDescription>
              </CardHeader>
              <CardContent>
                {employeeHistory.length === 0 ? <EmptyState /> : (
                  <div className="space-y-3">
                    {employeeHistory.slice(0, 20).map(({ employee, evaluations }) => {
                      const avg = evaluations.length > 0 ? Math.round((evaluations.reduce((s: number, e: any) => s + Number(e.total_marks), 0) / evaluations.length) * 10) / 10 : 0;
                      const best = Math.max(...evaluations.map((e: any) => Number(e.total_marks)));
                      return (
                        <div key={employee.employee_id} className="rounded-lg border p-4">
                          <div className="mb-2 flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={employee.photo ?? undefined} />
                              <AvatarFallback className="bg-muted text-xs">{getInitials(employee.name)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="font-medium">{employee.name}</div>
                              <div className="text-xs text-muted-foreground">{employee.employee_id} · {employee.department}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold">{avg}</div>
                              <div className="text-xs text-muted-foreground">avg · best {best}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {evaluations.map((e: any) => (
                              <Badge key={e.id} variant="outline" className="text-xs">
                                {MONTH_NAMES[e.month - 1].slice(0, 3)} {e.year}: {Number(e.total_marks)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Top 10 */}
          <TabsContent value="top10" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><TrendingUp className="h-5 w-5 text-green-600" /> Top 10 Performers — {MONTH_NAMES[month - 1]} {year}</CardTitle>
              </CardHeader>
              <CardContent>
                {top10.length === 0 ? <EmptyState /> : (
                  <div className="space-y-2">
                    {top10.map((r, i) => (
                      <div key={r.evaluation_id} className="flex items-center gap-4 rounded-lg border p-3 hover:bg-muted/30">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${i < 3 ? (i === 0 ? 'bg-gold text-white' : i === 1 ? 'bg-silver text-white' : 'bg-bronze text-white') : 'bg-muted text-muted-foreground'}`}>
                          {i + 1}
                        </div>
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={r.photo ?? undefined} />
                          <AvatarFallback className="bg-muted text-xs">{getInitials(r.name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium text-sm">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.department}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">{Number(r.total_marks)}</div>
                          <div className="text-xs text-muted-foreground">/ 100</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Lowest Performers */}
          <TabsContent value="lowest" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><TrendingDown className="h-5 w-5 text-destructive" /> Lowest Performers — {MONTH_NAMES[month - 1]} {year}</CardTitle>
                <CardDescription>Employees who may need additional safety training</CardDescription>
              </CardHeader>
              <CardContent>
                {lowest.length === 0 ? <EmptyState /> : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Emp ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead className="text-right">Dept</TableHead>
                          <TableHead className="text-right">HR</TableHead>
                          <TableHead className="text-right">Safety</TableHead>
                          <TableHead className="text-right">Negative</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lowest.map((r) => (
                          <TableRow key={r.evaluation_id}>
                            <TableCell className="text-xs">{r.employee_code}</TableCell>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell><Badge variant="secondary" className="text-xs">{r.department}</Badge></TableCell>
                            <TableCell className="text-right">{Number(r.department_marks)}</TableCell>
                            <TableCell className="text-right">{Number(r.hr_marks)}</TableCell>
                            <TableCell className="text-right">{Number(r.safety_marks)}</TableCell>
                            <TableCell className="text-right text-destructive">{Number(r.negative_marks) > 0 ? `-${Number(r.negative_marks)}` : '0'}</TableCell>
                            <TableCell className="text-right font-bold text-destructive">{Number(r.total_marks)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function reportTitle(tab: ReportTab): string {
  return { monthly: 'Monthly Ranking', department: 'Department Ranking', employee: 'Employee History', top10: 'Top 10 Performers', lowest: 'Lowest Performers' }[tab];
}

function EmptyState() {
  return (
    <div className="flex h-40 flex-col items-center justify-center text-center">
      <FileBarChart className="mb-2 h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">No data available for this period</p>
    </div>
  );
}

function getInitials(name: string): string {
  return name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
}
