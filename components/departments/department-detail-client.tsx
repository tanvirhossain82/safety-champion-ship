'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Users, ClipboardCheck, Loader2, Trophy, TrendingUp, Award,
  Building2, Boxes, Warehouse, FlaskConical, Droplets, Wrench, Cpu,
  Pencil, Trash2, Search,
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
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const ICON_MAP: Record<string, React.ElementType> = {
  Building2, Boxes, Warehouse, FlaskConical, Droplets, Wrench, Cpu,
};

interface EmpForm {
  employee_id: string;
  name: string;
  designation: string;
  joining_date: string;
  status: 'Active' | 'Inactive';
  photo: string | null;
}

const emptyEmpForm: EmpForm = {
  employee_id: '',
  name: '',
  designation: '',
  joining_date: format(new Date(), 'yyyy-MM-dd'),
  status: 'Active',
  photo: null,
};

export function DepartmentDetailClient({ code }: { code: string }) {
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [department, setDepartment] = useState<any>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [ranked, setRanked] = useState<RankedRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Employee add/edit state
  const [search, setSearch] = useState('');
  const [empDialogOpen, setEmpDialogOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState<EmpForm>(emptyEmpForm);
  const [empSaving, setEmpSaving] = useState(false);
  const [deleteEmp, setDeleteEmp] = useState<Employee | null>(null);

  const loadEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees').select('*').eq('department', code as Department).order('name');
    if (data) setEmployees(data as Employee[]);
  }, [code]);

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

  useEffect(() => { load(); }, [load]);

  const openEditEmp = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpForm({
      employee_id: emp.employee_id,
      name: emp.name,
      designation: emp.designation ?? '',
      joining_date: emp.joining_date,
      status: emp.status,
      photo: emp.photo,
    });
    setEmpDialogOpen(true);
  };

  const handleEmpSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm.employee_id.trim() || !empForm.name.trim()) {
      toast({ title: 'Employee ID and Name are required', variant: 'destructive' });
      return;
    }
    setEmpSaving(true);
    try {
      const payload = {
        employee_id: empForm.employee_id.trim(),
        name: empForm.name.trim(),
        department: code as Department,
        designation: empForm.designation.trim() || null,
        joining_date: empForm.joining_date,
        status: empForm.status,
        photo: empForm.photo,
      };
      if (editingEmp) {
        const { error } = await supabase.from('employees').update(payload).eq('id', editingEmp.id);
        if (error) throw error;
        await logAudit('UPDATE', 'employee', editingEmp.id, `Updated employee ${empForm.name} (${empForm.employee_id}) in ${code}`, profile?.email);
        toast({ title: 'Employee updated' });
      } else {
        const { error } = await supabase.from('employees').insert(payload);
        if (error) throw error;
        await logAudit('CREATE', 'employee', null, `Added employee ${empForm.name} (${empForm.employee_id}) to ${code}`, profile?.email);
        toast({ title: 'Employee added' });
      }
      setEmpDialogOpen(false);
      loadEmployees();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setEmpSaving(false);
    }
  };

  const handleEmpDelete = async () => {
    if (!deleteEmp) return;
    const { error } = await supabase.from('employees').delete().eq('id', deleteEmp.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('DELETE', 'employee', deleteEmp.id, `Deleted employee ${deleteEmp.name} (${deleteEmp.employee_id}) from ${code}`, profile?.email);
    toast({ title: 'Employee deleted' });
    setDeleteEmp(null);
    loadEmployees();
  };

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
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{department.name}</h1>
            <p className="text-sm text-muted-foreground">{department.description || 'Department sub-module'}</p>
          </div>
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
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          {employees.length > 0 && (
            <div className="relative mb-4 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by name or ID..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          )}
          {filteredEmployees.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-center">
              <Users className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{employees.length === 0 ? 'No employees in this department yet. Employees are managed from the Admin panel.' : 'No employees match your search'}</p>
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
                    <TableHead>Department</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map((emp, idx) => {
                    const evalRow = deptRanked.find((r) => r.employee_id === emp.id);
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
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{emp.department}</Badge>
                            {evalRow ? (
                              <Badge variant="outline" className="text-xs font-bold">{Number(evalRow.total_marks)} pts</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground">Not evaluated</Badge>
                            )}
                          </div>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditEmp(emp)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteEmp(emp)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employee add/edit dialog */}
      <Dialog open={empDialogOpen} onOpenChange={setEmpDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEmp ? 'Edit Employee' : 'Add Employee to ' + department.name}</DialogTitle>
            <DialogDescription>{editingEmp ? 'Update employee information' : 'Create a new employee in this department'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEmpSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emp_id">Employee ID *</Label>
                <Input id="emp_id" value={empForm.employee_id} onChange={(e) => setEmpForm((f) => ({ ...f, employee_id: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp_name">Full Name *</Label>
                <Input id="emp_name" value={empForm.name} onChange={(e) => setEmpForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emp_designation">Designation</Label>
                <Input id="emp_designation" value={empForm.designation} onChange={(e) => setEmpForm((f) => ({ ...f, designation: e.target.value }))} placeholder="e.g. Operator" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp_joining">Joining Date *</Label>
                <Input id="emp_joining" type="date" value={empForm.joining_date} onChange={(e) => setEmpForm((f) => ({ ...f, joining_date: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <Input value={department.name} disabled className="bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={empForm.status} onValueChange={(v: 'Active' | 'Inactive') => setEmpForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEmpDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={empSaving}>{empSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingEmp ? 'Save Changes' : 'Add Employee'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Employee delete confirmation */}
      <AlertDialog open={!!deleteEmp} onOpenChange={(open) => !open && setDeleteEmp(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteEmp?.name} ({deleteEmp?.employee_id}) and all related evaluations. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEmpDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </div>
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
