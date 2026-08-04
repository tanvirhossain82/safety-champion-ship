'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Users, ClipboardCheck, Loader2, Trophy, TrendingUp, Award,
  Building2, Boxes, Warehouse, FlaskConical, Droplets, Wrench, Cpu, Search,
  Plus, Save, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { fetchRankedEvaluations, RankedRow, logAudit } from '@/lib/data';
import { Employee, Department, MONTH_NAMES } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const ICON_MAP: Record<string, React.ElementType> = {
  Building2, Boxes, Warehouse, FlaskConical, Droplets, Wrench, Cpu,
};

interface KpiCriterion { name: string; max: number; }

const DEPT_KPI_CONFIG: Record<string, KpiCriterion[]> = {
  Emulsion: [
    { name: 'Efficiency', max: 10 },
    { name: 'Lead Time', max: 10 },
    { name: 'Team Work', max: 5 },
    { name: 'Attitude', max: 5 },
    { name: 'Responsibility', max: 5 },
    { name: 'Accuracy', max: 5 },
    { name: 'Waste Mgmt', max: 5 },
  ],
  Maintenance: [
    { name: 'Preventive Maintenance', max: 10 },
    { name: 'Breakdown Response & Repair Efficiency', max: 10 },
    { name: 'Teamwork', max: 5 },
    { name: 'Attitude', max: 5 },
    { name: 'Responsibility', max: 5 },
    { name: 'Claning', max: 5 },
    { name: 'Work Quality & Technical Skill', max: 5 },
  ],
  MRP: [
    { name: 'Unloading Efficiency', max: 10 },
    { name: 'Supply Lead', max: 10 },
    { name: 'Teamwork', max: 5 },
    { name: 'Attitude', max: 5 },
    { name: 'Responsibility', max: 5 },
    { name: 'Supply Accuracy', max: 5 },
    { name: 'Material Waste', max: 5 },
  ],
  Solvent: [
    { name: 'Efficiency', max: 10 },
    { name: 'Lead Time', max: 10 },
    { name: 'Teamwork', max: 5 },
    { name: 'Attitude', max: 5 },
    { name: 'Responsibility', max: 5 },
    { name: 'Accuracy', max: 5 },
    { name: 'Waste Mgmt', max: 5 },
  ],
  Technical: [
    { name: 'Test Accuracy', max: 5 },
    { name: 'R&D Lead Time', max: 10 },
    { name: 'Teamwork', max: 5 },
    { name: 'Attitude', max: 5 },
    { name: 'Responsibility', max: 5 },
    { name: 'Claning', max: 10 },
    { name: 'Documentation', max: 5 },
  ],
  Warehouse: [
    { name: 'Inventory Accuracy', max: 10 },
    { name: 'Order Fulfillment', max: 10 },
    { name: 'Teamwork', max: 5 },
    { name: 'Attitude', max: 5 },
    { name: 'Responsibility', max: 5 },
    { name: 'Accuracy', max: 5 },
    { name: 'Storage Management', max: 5 },
  ],
};

export function DepartmentDetailClient({ code }: { code: string }) {
  const router = useRouter();
  const { profile, can } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [department, setDepartment] = useState<any>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [ranked, setRanked] = useState<RankedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [evalOpen, setEvalOpen] = useState(false);
  const [kpiBreakdowns, setKpiBreakdowns] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deptRes, empRes, rankData] = await Promise.all([
        supabase.from('departments').select('*').eq('code', code).maybeSingle(),
        supabase.from('employees').select('*').eq('department', code as Department).order('name'),
        fetchRankedEvaluations(month, year),
      ]);
      if (deptRes.data) setDepartment(deptRes.data);
      if (empRes.data) setEmployees(empRes.data as Employee[]);
      setRanked(rankData.filter((r) => r.department === code));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [code, month, year]);

  const loadKpiBreakdowns = useCallback(async () => {
    const empIds = employees.map((e) => e.id);
    if (empIds.length === 0) return;
    const { data } = await supabase
      .from('dept_kpi_breakdowns')
      .select('*')
      .in('employee_id', empIds)
      .eq('month', month)
      .eq('year', year);
    if (data) {
      const map: Record<string, any> = {};
      data.forEach((row) => { map[row.employee_id] = row; });
      setKpiBreakdowns(map);
    }
  }, [employees, month, year]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (employees.length > 0) loadKpiBreakdowns(); }, [loadKpiBreakdowns]);

  const filteredEmployees = employees.filter((e) => {
    const s = search.toLowerCase();
    return !s || e.name.toLowerCase().includes(s) || e.employee_id.toLowerCase().includes(s);
  });

  const activeEmployees = employees.filter((e) => e.status === 'Active');
  const deptRanked = ranked.filter((r) => r.department === code);
  const topPerformer = deptRanked[0];
  const avgScore = deptRanked.length > 0
    ? Math.round((deptRanked.reduce((s, r) => s + Number(r.total_marks), 0) / deptRanked.length) * 10) / 10
    : 0;

  const scoreBreakdown = useMemo(() => {
    if (deptRanked.length === 0) return [];
    const avgDept = Math.round((deptRanked.reduce((s, r) => s + Number(r.department_marks), 0) / deptRanked.length) * 10) / 10;
    const avgHR = Math.round((deptRanked.reduce((s, r) => s + Number(r.hr_marks), 0) / deptRanked.length) * 10) / 10;
    const avgSafety = Math.round((deptRanked.reduce((s, r) => s + Number(r.safety_marks), 0) / deptRanked.length) * 10) / 10;
    const avgNeg = Math.round((deptRanked.reduce((s, r) => s + Number(r.negative_marks), 0) / deptRanked.length) * 10) / 10;
    return [
      { category: 'Department', value: avgDept, max: 45, fill: 'hsl(var(--chart-1))' },
      { category: 'HR', value: avgHR, max: 25, fill: 'hsl(var(--chart-3))' },
      { category: 'Safety', value: avgSafety, max: 30, fill: 'hsl(var(--accent))' },
      { category: 'Negative', value: avgNeg, max: 20, fill: 'hsl(var(--destructive))' },
    ];
  }, [deptRanked]);

  const canEvaluate = profile && (profile.role === 'admin' || (profile.role === 'dept_head' && profile.department === code));

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
    );
  }

  if (!department) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.push('/departments')}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Departments</Button>
        <Card><CardContent className="flex h-40 flex-col items-center justify-center"><Building2 className="mb-2 h-10 w-10 text-muted-foreground/40" /><p className="text-sm text-muted-foreground">Department "{code}" not found</p></CardContent></Card>
      </div>
    );
  }

  const Icon = ICON_MAP[department.icon] || Building2;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/departments">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="flex flex-1 items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{department.name}</h1>
            <p className="text-sm text-muted-foreground">{department.description || 'Department sub-module'}</p>
          </div>
          {canEvaluate && (
            <Button onClick={() => setEvalOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Department Evaluation
            </Button>
          )}
        </div>
      </div>

      {/* Period selector */}
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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="Total Employees" value={employees.length} color="primary" />
        <StatCard icon={ClipboardCheck} label="Evaluated" value={deptRanked.length} color="accent" />
        <StatCard icon={TrendingUp} label="Average Score" value={avgScore} color="chart-3" />
        <StatCard icon={Award} label="Top Score" value={topPerformer ? Number(topPerformer.total_marks) : 0} color="gold" />
      </div>

      {/* Top performer + score breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {topPerformer ? (
          <Card className="border-gold/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Trophy className="h-5 w-5 text-gold" /> Department Top Performer</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-4 border-gold">
                <AvatarImage src={topPerformer.photo ?? undefined} />
                <AvatarFallback className="bg-gold/20 text-gold font-bold">{getInitials(topPerformer.name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="text-lg font-bold">{topPerformer.name}</div>
                <div className="text-sm text-muted-foreground">{topPerformer.employee_code} · {MONTH_NAMES[month - 1]} {year}</div>
                <div className="mt-2 flex gap-4 text-sm">
                  <span><span className="font-semibold">{Number(topPerformer.total_marks)}</span> total</span>
                  <span className="text-muted-foreground">Dept {Number(topPerformer.department_marks)} / HR {Number(topPerformer.hr_marks)} / Safety {Number(topPerformer.safety_marks)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">No evaluations for {MONTH_NAMES[month - 1]} {year}</CardContent></Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-lg">Score Breakdown</CardTitle><CardDescription>Average marks by category for {MONTH_NAMES[month - 1]} {year}</CardDescription></CardHeader>
          <CardContent>
            {scoreBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={scoreBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {scoreBreakdown.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">No data</div>}
          </CardContent>
        </Card>
      </div>

      {/* Employees list */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-primary" /> Employees in {department.name}</CardTitle>
              <CardDescription>{activeEmployees.length} active, {employees.length - activeEmployees.length} inactive</CardDescription>
            </div>
            <Link href="/admin">
              <Button size="sm" variant="outline"><Users className="mr-2 h-4 w-4" /> Manage Employees</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {employees.length > 0 && (
            <div className="relative mb-4 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by name or ID..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          )}
          {filteredEmployees.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-center">
              <Users className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{employees.length === 0 ? 'No employees in this department yet' : 'No employees match your search'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">SL</TableHead>
                    <TableHead className="w-12">Photo</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">KPI (Dept)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map((emp, idx) => {
                    const evalRow = deptRanked.find((r) => r.employee_id === emp.id);
                    const kpi = kpiBreakdowns[emp.id];
                    return (
                      <TableRow key={emp.id} className="hover:bg-muted/50">
                        <TableCell className="text-muted-foreground font-medium">{idx + 1}</TableCell>
                        <TableCell>
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={emp.photo ?? undefined} />
                            <AvatarFallback className="bg-muted text-[10px]">{getInitials(emp.name)}</AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{emp.employee_id}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{emp.name}</div>
                          <div className="text-xs text-muted-foreground">{emp.designation || '—'}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={emp.status === 'Active' ? 'secondary' : 'outline'} className="text-xs">{emp.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {kpi ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm font-bold text-primary">{Number(kpi.total)} / 45</span>
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            </div>
                          ) : evalRow ? (
                            <span className="text-sm font-bold">{Number(evalRow.department_marks)} / 45</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not evaluated</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Department leaderboard */}
      {deptRanked.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Trophy className="h-5 w-5 text-primary" /> Department Leaderboard — {MONTH_NAMES[month - 1]} {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Photo</TableHead>
                    <TableHead>Emp ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Dept</TableHead>
                    <TableHead className="text-right">HR</TableHead>
                    <TableHead className="text-right">Safety</TableHead>
                    <TableHead className="text-right">Neg</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deptRanked.map((r) => (
                    <TableRow key={r.evaluation_id} className="hover:bg-muted/50">
                      <TableCell>
                        <Badge variant={r.rank === 1 ? 'default' : 'outline'} className={r.rank === 1 ? 'bg-gold text-white' : ''}>{r.rank}</Badge>
                      </TableCell>
                      <TableCell>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={r.photo ?? undefined} />
                          <AvatarFallback className="bg-muted text-[10px]">{getInitials(r.name)}</AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{r.employee_code}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
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
          </CardContent>
        </Card>
      )}

      {/* KPI Evaluation Dialog */}
      {canEvaluate && (
        <DeptEvalDialog
          open={evalOpen}
          onClose={() => setEvalOpen(false)}
          employees={employees.filter((e) => e.status === 'Active')}
          department={code}
          month={month}
          year={year}
          kpiConfig={DEPT_KPI_CONFIG[code] ?? []}
          profile={profile}
          existingBreakdowns={kpiBreakdowns}
          onSaved={() => { load(); loadKpiBreakdowns(); }}
        />
      )}
    </div>
  );
}

// ── KPI Evaluation Dialog ───────────────────────────────────────────────────

interface DeptEvalDialogProps {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  department: string;
  month: number;
  year: number;
  kpiConfig: KpiCriterion[];
  profile: any;
  existingBreakdowns: Record<string, any>;
  onSaved: () => void;
}

function DeptEvalDialog({
  open, onClose, employees, department, month, year, kpiConfig, profile, existingBreakdowns, onSaved,
}: DeptEvalDialogProps) {
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [scores, setScores] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  const filteredEmps = employees.filter((e) => {
    const s = empSearch.toLowerCase();
    return !s || e.name.toLowerCase().includes(s) || e.employee_id.toLowerCase().includes(s);
  });

  // When an employee is selected, pre-fill from existing breakdown if available
  useEffect(() => {
    if (!selectedEmpId || kpiConfig.length === 0) {
      setScores(kpiConfig.map(() => 0));
      return;
    }
    const existing = existingBreakdowns[selectedEmpId];
    if (existing?.criteria) {
      const mapped = kpiConfig.map((c, i) => {
        const found = existing.criteria.find((x: any) => x.name === c.name);
        return found ? Number(found.score) : 0;
      });
      setScores(mapped);
    } else {
      setScores(kpiConfig.map(() => 0));
    }
  }, [selectedEmpId, kpiConfig, existingBreakdowns]);

  const total = scores.reduce((s, v) => s + v, 0);
  const maxTotal = kpiConfig.reduce((s, c) => s + c.max, 0);

  const handleScore = (idx: number, val: string) => {
    const num = Math.min(kpiConfig[idx].max, Math.max(0, parseFloat(val) || 0));
    setScores((prev) => { const next = [...prev]; next[idx] = num; return next; });
  };

  const handleSave = async () => {
    if (!selectedEmpId) { toast({ title: 'Select an employee', variant: 'destructive' }); return; }

    setSaving(true);
    try {
      const criteria = kpiConfig.map((c, i) => ({ name: c.name, max: c.max, score: scores[i] ?? 0 }));

      // Upsert KPI breakdown
      const { error: kpiError } = await supabase
        .from('dept_kpi_breakdowns')
        .upsert({
          employee_id: selectedEmpId,
          month,
          year,
          department,
          criteria,
          total,
          created_by: profile?.id ?? null,
        }, { onConflict: 'employee_id,month,year' });

      if (kpiError) throw kpiError;

      // Sync department_marks into evaluations table
      const { data: existingEval } = await supabase
        .from('evaluations')
        .select('id')
        .eq('employee_id', selectedEmpId)
        .eq('month', month)
        .eq('year', year)
        .maybeSingle();

      if (existingEval) {
        await supabase
          .from('evaluations')
          .update({ department_marks: total })
          .eq('id', existingEval.id);
      } else {
        await supabase.from('evaluations').insert({
          employee_id: selectedEmpId,
          month,
          year,
          department_marks: total,
          hr_marks: 0,
          safety_marks: 0,
          negative_marks: 0,
          created_by: profile?.id ?? null,
        });
      }

      const emp = employees.find((e) => e.id === selectedEmpId);
      await logAudit('CREATE', 'dept_kpi_breakdown', selectedEmpId, `KPI breakdown saved for ${emp?.name} (${month}/${year}) — ${total}/${maxTotal}`, profile?.email);

      toast({ title: 'KPI evaluation saved', description: `${emp?.name}: ${total} / ${maxTotal} marks` });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Department KPI Evaluation
          </DialogTitle>
          <DialogDescription>
            {MONTH_NAMES[month - 1]} {year} — {department} Department (Max: {maxTotal} marks)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Employee selector */}
          <div className="space-y-2">
            <Label>Select Employee</Label>
            <Input
              placeholder="Search by name or ID..."
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              className="mb-1"
            />
            <Select value={selectedEmpId} onValueChange={setSelectedEmpId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose employee..." />
              </SelectTrigger>
              <SelectContent className="max-h-52">
                {filteredEmps.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.employee_id} — {emp.name}
                    {existingBreakdowns[emp.id] ? ' ✓' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* KPI criteria inputs */}
          {kpiConfig.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold">KPI Criteria</Label>
              <div className="rounded-lg border divide-y">
                {kpiConfig.map((criterion, idx) => (
                  <div key={criterion.name} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{criterion.name}</div>
                      <div className="text-xs text-muted-foreground">Max: {criterion.max}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={criterion.max}
                        step={0.5}
                        value={scores[idx] ?? 0}
                        onChange={(e) => handleScore(idx, e.target.value)}
                        className="w-20 text-center font-semibold"
                        disabled={!selectedEmpId}
                      />
                      <span className="text-xs text-muted-foreground w-12">/ {criterion.max}</span>
                      <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${criterion.max > 0 ? ((scores[idx] ?? 0) / criterion.max) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total bar */}
          <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">KPI Total</div>
              <div className="text-3xl font-bold">
                {total}
                <span className="text-base font-normal text-muted-foreground"> / {maxTotal}</span>
              </div>
            </div>
            <div className="flex-1 max-w-xs">
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
                  style={{ width: `${maxTotal > 0 ? (total / maxTotal) * 100 : 0}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1 text-right">
                {maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0}%
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !selectedEmpId}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Evaluation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-accent',
    'chart-3': 'bg-chart-3/10 text-chart-3',
    gold: 'bg-gold/10 text-gold',
  };
  return (
    <Card className="animate-fade-in">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorMap[color]}`}><Icon className="h-5 w-5" /></div>
        <div><div className="text-xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>
      </CardContent>
    </Card>
  );
}

function getInitials(name: string): string {
  return name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
}
