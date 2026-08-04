'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardCheck, Save, Loader2, Search, AlertCircle, CheckCircle2, Trash2, Pencil,
  ShieldCheck, HeartHandshake,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { logAudit } from '@/lib/data';
import { Employee, Evaluation, DEPARTMENTS, MONTH_NAMES, NegativeReason, HrCriteriaBreakdown } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { ROLE_PERMISSIONS, UserRole } from '@/lib/types';

// ── HR Criteria definitions (following the HR evaluation sheet) ──────────────

interface CriterionDef {
  key: string;
  label: string;
  max: number;
}

const HR_POSITIVE_CRITERIA: CriterionDef[] = [
  { key: 'attendance', label: 'Attendance', max: 5 },
  { key: 'punctuality', label: 'Punctuality', max: 5 },
  { key: 'lunch_punch', label: 'Lunch Punch', max: 5 },
  { key: 'uniform', label: 'Uniform', max: 2 },
  { key: 'rules_regulation', label: 'Rules & Regulation', max: 5 },
  { key: 'leave_discipline', label: 'Leave Discipline', max: 3 },
];

const HR_NEGATIVE_CRITERIA: CriterionDef[] = [
  { key: 'unauthorized_leave', label: 'Unauthorized Leave', max: 5 },
  { key: 'lunch_punch_miss', label: 'Lunch Punch Miss', max: 1 },
  { key: 'late_attendance', label: 'Late Attendance', max: 3 },
  { key: 'leave_indiscipline', label: 'Leave Indiscipline', max: 2 },
  { key: 'uniform_miss', label: 'Uniform', max: 2 },
  { key: 'warning_letter', label: 'Warning Letter', max: 5 },
  { key: 'show_cause', label: 'Show Cause', max: 3 },
  { key: 'misconduct', label: 'Misconduct', max: 10 },
];

const HR_POSITIVE_MAX = 25;
const HR_NEGATIVE_MAX = HR_NEGATIVE_CRITERIA.reduce((s, c) => s + c.max, 0);

function emptyHrCriteria(): HrCriteriaBreakdown {
  const positive: Record<string, number> = {};
  const negative: Record<string, number> = {};
  HR_POSITIVE_CRITERIA.forEach((c) => { positive[c.key] = 0; });
  HR_NEGATIVE_CRITERIA.forEach((c) => { negative[c.key] = 0; });
  return { positive, negative };
}

function sumCriteria(criteria: Record<string, number>): number {
  return Object.values(criteria).reduce((s, v) => s + (Number(v) || 0), 0);
}

// ── Main component ───────────────────────────────────────────────────────────

export function EvaluationClient() {
  const { profile, can } = useAuth();
  const [tab, setTab] = useState<'hr' | 'safety'>('hr');

  useEffect(() => {
    if (profile) {
      if (profile.role === 'safety') setTab('safety');
      else setTab('hr');
    }
  }, [profile]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Evaluation</h1>
        <p className="text-sm text-muted-foreground">Enter monthly evaluation marks by category</p>
      </div>

      {profile && (
        <Alert className="border-primary/20 bg-primary/5">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            <span className="font-medium">Your role: {profile.role === 'dept_head' ? 'Department Head' : profile.role.toUpperCase()}</span>
            {' — '}
            {profile.role === 'admin' && 'You can enter all score types (Department, HR, Safety).'}
            {profile.role === 'hr' && 'You can enter HR marks only.'}
            {profile.role === 'safety' && 'You can enter Safety marks only.'}
            {profile.role === 'dept_head' && 'Department marks are entered from your department page.'}
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'hr' | 'safety')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="hr" className="gap-2" disabled={profile ? !can('canEvaluateHR') && profile.role !== 'admin' : false}>
            <HeartHandshake className="h-4 w-4" /> Human Resource
          </TabsTrigger>
          <TabsTrigger value="safety" className="gap-2" disabled={profile ? !can('canEvaluateSafety') && profile.role !== 'admin' : false}>
            <ShieldCheck className="h-4 w-4" /> Safety
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hr" className="mt-6">
          <HrEvaluation
            canEvaluate={profile ? can('canEvaluateHR') : false}
            profile={profile}
          />
        </TabsContent>

        <TabsContent value="safety" className="mt-6">
          <SafetyEvaluation
            canEvaluate={profile ? can('canEvaluateSafety') : false}
            profile={profile}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Shared form types ─────────────────────────────────────────────────────────

interface BaseForm {
  employeeId: string;
  month: number;
  year: number;
  remarks: string;
}

// ── HR Evaluation (criteria-based) ─────────────────────────────────────────────

interface HrForm extends BaseForm {
  hrCriteria: HrCriteriaBreakdown;
}

function HrEvaluation({ canEvaluate, profile }: { canEvaluate: boolean; profile: any }) {
  const now = new Date();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState<HrForm>({
    employeeId: '',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    remarks: '',
    hrCriteria: emptyHrCriteria(),
  });
  const [search, setSearch] = useState('');
  const [existing, setExisting] = useState<Evaluation[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const pageSize = 8;

  const loadData = useCallback(async () => {
    const { data } = await supabase.from('employees').select('*').eq('status', 'Active').order('name');
    if (data) setEmployees(data as Employee[]);
  }, []);

  const loadExisting = useCallback(async () => {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*, employees!inner(employee_id, name, department, photo)')
      .eq('month', form.month)
      .eq('year', form.year)
      .order('total_marks', { ascending: false });
    if (error) toast({ title: 'Error loading evaluations', description: error.message, variant: 'destructive' });
    else setExisting((data ?? []) as unknown as Evaluation[]);
  }, [form.month, form.year]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadExisting(); }, [loadExisting]);

  const selectedEmployee = employees.find((e) => e.id === form.employeeId);
  const isDuplicate = useMemo(() => {
    if (!form.employeeId) return false;
    return existing.some((ev) => ev.employee_id === form.employeeId && ev.id !== editingId);
  }, [existing, form.employeeId, editingId]);

  const filteredEmployees = useMemo(() => {
    const s = search.toLowerCase();
    return employees.filter((e) => {
      const matchesSearch = !s || e.name.toLowerCase().includes(s) || e.employee_id.toLowerCase().includes(s);
      const matchesDept = deptFilter === 'all' || e.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [employees, search, deptFilter]);

  const filteredExisting = useMemo(() => {
    return existing.filter((ev: any) => {
      if (deptFilter === 'all') return true;
      return ev.employees?.department === deptFilter;
    });
  }, [existing, deptFilter]);

  const positiveTotal = sumCriteria(form.hrCriteria.positive);
  const negativeTotal = sumCriteria(form.hrCriteria.negative);

  const setPositiveCriterion = (key: string, value: number, max: number) => {
    const clamped = Math.max(0, Math.min(max, value));
    setForm((f) => ({
      ...f,
      hrCriteria: {
        ...f.hrCriteria,
        positive: { ...f.hrCriteria.positive, [key]: clamped },
      },
    }));
  };

  const setNegativeCriterion = (key: string, value: number, max: number) => {
    const clamped = Math.max(0, Math.min(max, value));
    setForm((f) => ({
      ...f,
      hrCriteria: {
        ...f.hrCriteria,
        negative: { ...f.hrCriteria.negative, [key]: clamped },
      },
    }));
  };

  const startEdit = (ev: Evaluation) => {
    setEditingId(ev.id);
    let criteria: HrCriteriaBreakdown;
    if (ev.hr_criteria && typeof ev.hr_criteria === 'object' && ev.hr_criteria.positive && ev.hr_criteria.negative) {
      criteria = {
        positive: { ...emptyHrCriteria().positive, ...ev.hr_criteria.positive },
        negative: { ...emptyHrCriteria().negative, ...ev.hr_criteria.negative },
      };
    } else {
      // Legacy row without breakdown — distribute hr_marks evenly is not meaningful,
      // so start empty and let the user re-enter criteria.
      criteria = emptyHrCriteria();
    }
    setForm({
      employeeId: ev.employee_id,
      month: ev.month,
      year: ev.year,
      remarks: ev.remarks ?? '',
      hrCriteria: criteria,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      employeeId: '',
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      remarks: '',
      hrCriteria: emptyHrCriteria(),
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId) { toast({ title: 'Select an employee', variant: 'destructive' }); return; }
    if (isDuplicate) { toast({ title: 'Duplicate evaluation', description: 'This employee already has an evaluation for this month.', variant: 'destructive' }); return; }

    if (positiveTotal > HR_POSITIVE_MAX) {
      toast({ title: 'Positive marks exceed maximum', description: `HR positive max is ${HR_POSITIVE_MAX}`, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const hrMarks = positiveTotal;
      const negMarks = negativeTotal;
      const hrCriteriaJson = form.hrCriteria;

      if (editingId) {
        const updatePayload: any = {
          hr_marks: hrMarks,
          negative_marks: negMarks,
          hr_criteria: hrCriteriaJson,
          remarks: form.remarks.trim() || null,
        };
        const { error } = await supabase.from('evaluations').update(updatePayload).eq('id', editingId);
        if (error) throw error;
        await logAudit('UPDATE', 'evaluation', editingId, `Updated HR evaluation for ${selectedEmployee?.name}`, profile?.email);
        toast({ title: 'Evaluation updated' });
      } else {
        const { data: existingRow } = await supabase
          .from('evaluations')
          .select('id, department_marks, hr_marks, safety_marks')
          .eq('employee_id', form.employeeId)
          .eq('month', form.month)
          .eq('year', form.year)
          .maybeSingle();

        if (existingRow) {
          const updatePayload: any = {
            hr_marks: hrMarks,
            negative_marks: negMarks,
            hr_criteria: hrCriteriaJson,
            remarks: form.remarks.trim() || null,
          };
          const { error } = await supabase.from('evaluations').update(updatePayload).eq('id', existingRow.id);
          if (error) throw error;
          await logAudit('UPDATE', 'evaluation', existingRow.id, `Updated HR marks for ${selectedEmployee?.name}`, profile?.email);
          toast({ title: 'Evaluation updated' });
        } else {
          const insertPayload: any = {
            employee_id: form.employeeId,
            month: form.month,
            year: form.year,
            department_marks: 0,
            hr_marks: hrMarks,
            safety_marks: 0,
            negative_marks: negMarks,
            hr_criteria: hrCriteriaJson,
            remarks: form.remarks.trim() || null,
            created_by: profile?.id,
          };
          const { error } = await supabase.from('evaluations').insert(insertPayload);
          if (error) throw error;
          await logAudit('CREATE', 'evaluation', null, `Created HR evaluation for ${selectedEmployee?.name} (${form.month}/${form.year})`, profile?.email);
          toast({ title: 'Evaluation saved' });
        }
      }
      resetForm();
      loadExisting();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ev: Evaluation) => {
    const { error } = await supabase.from('evaluations').delete().eq('id', ev.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('DELETE', 'evaluation', ev.id, 'Deleted evaluation', profile?.email);
    toast({ title: 'Evaluation deleted' });
    loadExisting();
  };

  const perms = profile ? ROLE_PERMISSIONS[profile.role as UserRole] : null;
  const canDelete = perms?.canDeleteEvaluations;

  const existingPaged = filteredExisting.slice(page * pageSize, (page + 1) * pageSize);
  const pageCount = Math.ceil(filteredExisting.length / pageSize) || 1;

  if (!canEvaluate && profile?.role !== 'admin') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <HeartHandshake className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">You don&apos;t have permission to enter HR marks.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* Form */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HeartHandshake className="h-5 w-5 text-chart-3" />
            {editingId ? 'Edit HR Evaluation' : 'New HR Evaluation'}
          </CardTitle>
          <CardDescription>Score employees on HR criteria (max 25 positive marks)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            {/* Period selectors */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={String(form.month)} onValueChange={(v) => setForm((f) => ({ ...f, month: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select value={String(form.year)} onValueChange={(v) => setForm((f) => ({ ...f, year: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Department filter */}
            <div className="space-y-2">
              <Label>Filter by Department</Label>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Employee picker */}
            <div className="space-y-2">
              <Label>Employee</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search employees..." className="mb-2 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={form.employeeId} onValueChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {filteredEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.employee_id} — {emp.name} ({emp.department})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isDuplicate && (
              <Alert className="border-destructive/30 bg-destructive/5">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <AlertDescription className="text-destructive">
                  This employee already has an evaluation for {MONTH_NAMES[form.month - 1]} {form.year}. Edit it from the list below instead.
                </AlertDescription>
              </Alert>
            )}

            {/* Positive criteria table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-chart-3">Positive Marks</Label>
                <Badge variant="secondary" className="font-bold text-chart-3">
                  {positiveTotal} / {HR_POSITIVE_MAX}
                </Badge>
              </div>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60%]">Criteria</TableHead>
                      <TableHead className="text-center">Max</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {HR_POSITIVE_CRITERIA.map((c) => (
                      <TableRow key={c.key}>
                        <TableCell className="text-sm">{c.label}</TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">{c.max}</TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min={0}
                            max={c.max}
                            step="0.5"
                            value={form.hrCriteria.positive[c.key] ?? 0}
                            onChange={(e) => setPositiveCriterion(c.key, parseFloat(e.target.value) || 0, c.max)}
                            className="h-8 w-20 text-center"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 font-semibold">
                      <TableCell>Total Positive</TableCell>
                      <TableCell className="text-center text-muted-foreground">{HR_POSITIVE_MAX}</TableCell>
                      <TableCell className="text-center text-chart-3">{positiveTotal}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-chart-3 transition-all duration-500" style={{ width: `${Math.min(100, (positiveTotal / HR_POSITIVE_MAX) * 100)}%` }} />
              </div>
            </div>

            {/* Negative criteria table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-destructive">Negative Marks (Deductions)</Label>
                <Badge variant="secondary" className="font-bold text-destructive">
                  -{negativeTotal} / -{HR_NEGATIVE_MAX}
                </Badge>
              </div>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60%]">Criteria</TableHead>
                      <TableHead className="text-center">Max Deduct</TableHead>
                      <TableHead className="text-center">Deduct</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {HR_NEGATIVE_CRITERIA.map((c) => (
                      <TableRow key={c.key}>
                        <TableCell className="text-sm">{c.label}</TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">-{c.max}</TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min={0}
                            max={c.max}
                            step="0.5"
                            value={form.hrCriteria.negative[c.key] ?? 0}
                            onChange={(e) => setNegativeCriterion(c.key, parseFloat(e.target.value) || 0, c.max)}
                            className="h-8 w-20 text-center"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 font-semibold">
                      <TableCell>Total Negative</TableCell>
                      <TableCell className="text-center text-muted-foreground">-{HR_NEGATIVE_MAX}</TableCell>
                      <TableCell className="text-center text-destructive">-{negativeTotal}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Net HR score summary */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <span className="text-sm font-medium">Net HR Score (Positive - Negative)</span>
              <Badge className={`text-base font-bold ${positiveTotal - negativeTotal >= 0 ? 'bg-chart-3' : 'bg-destructive'}`}>
                {(positiveTotal - negativeTotal).toFixed(1)}
              </Badge>
            </div>

            {/* Remarks */}
            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea
                id="remarks"
                placeholder="Optional notes about this evaluation..."
                value={form.remarks}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={saving || isDuplicate} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> {editingId ? 'Update' : 'Save'} Evaluation</>}
              </Button>
              {editingId && <Button type="button" variant="outline" onClick={resetForm}>Cancel Edit</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Existing evaluations list */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">Existing Evaluations</CardTitle>
          <CardDescription>{MONTH_NAMES[form.month - 1]} {form.year} — {filteredExisting.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredExisting.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No evaluations for this month yet</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {existingPaged.map((ev: any) => {
                  const hrMarks = Number(ev.hr_marks);
                  const negMarks = Number(ev.negative_marks);
                  return (
                    <div key={ev.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium text-sm">{ev.employees?.name ?? 'Unknown'}</div>
                        <div className="text-xs text-muted-foreground">{ev.employees?.employee_id} · {ev.employees?.department}</div>
                        {ev.hr_criteria && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {HR_POSITIVE_CRITERIA.map((c) => {
                              const v = ev.hr_criteria?.positive?.[c.key];
                              if (!v) return null;
                              return <span key={c.key} className="text-[10px] text-chart-3">{c.label}: {v}</span>;
                            })}
                            {HR_NEGATIVE_CRITERIA.map((c) => {
                              const v = ev.hr_criteria?.negative?.[c.key];
                              if (!v) return null;
                              return <span key={c.key} className="text-[10px] text-destructive">{c.label}: -{v}</span>;
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <Badge variant="secondary" className="font-bold text-chart-3">{hrMarks}</Badge>
                        {negMarks > 0 && <span className="text-[10px] text-destructive">-{negMarks}</span>}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(ev)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(ev)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {pageCount > 1 && (
                <div className="flex items-center justify-between pt-3">
                  <p className="text-xs text-muted-foreground">Page {page + 1} of {pageCount}</p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
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

// ── Safety Evaluation (single-score, unchanged from original) ──────────────────

interface SafetyForm extends BaseForm {
  marks: string;
  negative_marks: string;
}

function SafetyEvaluation({ canEvaluate, profile }: { canEvaluate: boolean; profile: any }) {
  const maxMarks = 30;
  const now = new Date();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [negativeReasons, setNegativeReasons] = useState<NegativeReason[]>([]);
  const [form, setForm] = useState<SafetyForm>({
    employeeId: '',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    marks: '0',
    negative_marks: '0',
    remarks: '',
  });
  const [search, setSearch] = useState('');
  const [existing, setExisting] = useState<Evaluation[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const pageSize = 8;

  const loadData = useCallback(async () => {
    const [empRes, negRes] = await Promise.all([
      supabase.from('employees').select('*').eq('status', 'Active').order('name'),
      supabase.from('negative_reasons').select('*').eq('status', 'Active').order('deduction_marks'),
    ]);
    if (empRes.data) setEmployees(empRes.data as Employee[]);
    if (negRes.data) setNegativeReasons(negRes.data as NegativeReason[]);
  }, []);

  const loadExisting = useCallback(async () => {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*, employees!inner(employee_id, name, department, photo)')
      .eq('month', form.month)
      .eq('year', form.year)
      .order('total_marks', { ascending: false });
    if (error) toast({ title: 'Error loading evaluations', description: error.message, variant: 'destructive' });
    else setExisting((data ?? []) as unknown as Evaluation[]);
  }, [form.month, form.year]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadExisting(); }, [loadExisting]);

  const selectedEmployee = employees.find((e) => e.id === form.employeeId);
  const isDuplicate = useMemo(() => {
    if (!form.employeeId) return false;
    return existing.some((ev) => ev.employee_id === form.employeeId && ev.id !== editingId);
  }, [existing, form.employeeId, editingId]);

  const filteredEmployees = useMemo(() => {
    const s = search.toLowerCase();
    return employees.filter((e) => {
      const matchesSearch = !s || e.name.toLowerCase().includes(s) || e.employee_id.toLowerCase().includes(s);
      const matchesDept = deptFilter === 'all' || e.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [employees, search, deptFilter]);

  const filteredExisting = useMemo(() => {
    return existing.filter((ev: any) => {
      if (deptFilter === 'all') return true;
      return ev.employees?.department === deptFilter;
    });
  }, [existing, deptFilter]);

  const startEdit = (ev: Evaluation) => {
    setEditingId(ev.id);
    setForm({
      employeeId: ev.employee_id,
      month: ev.month,
      year: ev.year,
      marks: String(ev.safety_marks),
      negative_marks: String(ev.negative_marks),
      remarks: ev.remarks ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      employeeId: '',
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      marks: '0',
      negative_marks: '0',
      remarks: '',
    });
  };

  const addNegativeReason = (reason: NegativeReason) => {
    const current = parseFloat(form.negative_marks) || 0;
    setForm((f) => ({ ...f, negative_marks: String(current + reason.deduction_marks) }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId) { toast({ title: 'Select an employee', variant: 'destructive' }); return; }
    if (isDuplicate) { toast({ title: 'Duplicate evaluation', description: 'This employee already has an evaluation for this month.', variant: 'destructive' }); return; }

    const marksVal = parseFloat(form.marks) || 0;
    const negVal = parseFloat(form.negative_marks) || 0;

    if (marksVal > maxMarks) {
      toast({ title: 'Marks exceed maximum', description: `Safety max is ${maxMarks}`, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const updatePayload: any = {
          negative_marks: negVal,
          remarks: form.remarks.trim() || null,
        };
        updatePayload.safety_marks = marksVal;

        const { error } = await supabase.from('evaluations').update(updatePayload).eq('id', editingId);
        if (error) throw error;
        await logAudit('UPDATE', 'evaluation', editingId, `Updated SAFETY evaluation for ${selectedEmployee?.name}`, profile?.email);
        toast({ title: 'Evaluation updated' });
      } else {
        const { data: existingRow } = await supabase
          .from('evaluations')
          .select('id, department_marks, hr_marks, safety_marks')
          .eq('employee_id', form.employeeId)
          .eq('month', form.month)
          .eq('year', form.year)
          .maybeSingle();

        if (existingRow) {
          const updatePayload: any = {
            negative_marks: negVal,
            remarks: form.remarks.trim() || null,
          };
          updatePayload.safety_marks = marksVal;

          const { error } = await supabase.from('evaluations').update(updatePayload).eq('id', existingRow.id);
          if (error) throw error;
          await logAudit('UPDATE', 'evaluation', existingRow.id, `Updated SAFETY marks for ${selectedEmployee?.name}`, profile?.email);
          toast({ title: 'Evaluation updated' });
        } else {
          const insertPayload: any = {
            employee_id: form.employeeId,
            month: form.month,
            year: form.year,
            department_marks: 0,
            hr_marks: 0,
            safety_marks: marksVal,
            negative_marks: negVal,
            remarks: form.remarks.trim() || null,
            created_by: profile?.id,
          };
          const { error } = await supabase.from('evaluations').insert(insertPayload);
          if (error) throw error;
          await logAudit('CREATE', 'evaluation', null, `Created SAFETY evaluation for ${selectedEmployee?.name} (${form.month}/${form.year})`, profile?.email);
          toast({ title: 'Evaluation saved' });
        }
      }
      resetForm();
      loadExisting();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ev: Evaluation) => {
    const { error } = await supabase.from('evaluations').delete().eq('id', ev.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('DELETE', 'evaluation', ev.id, 'Deleted evaluation', profile?.email);
    toast({ title: 'Evaluation deleted' });
    loadExisting();
  };

  const perms = profile ? ROLE_PERMISSIONS[profile.role as UserRole] : null;
  const canDelete = perms?.canDeleteEvaluations;

  const existingPaged = filteredExisting.slice(page * pageSize, (page + 1) * pageSize);
  const pageCount = Math.ceil(filteredExisting.length / pageSize) || 1;

  const marksVal = parseFloat(form.marks) || 0;
  const negVal = parseFloat(form.negative_marks) || 0;

  if (!canEvaluate && profile?.role !== 'admin') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <ShieldCheck className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">You don&apos;t have permission to enter Safety marks.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-accent" />
            {editingId ? 'Edit Safety Evaluation' : 'New Safety Evaluation'}
          </CardTitle>
          <CardDescription>Score employees on safety criteria (max 30 marks)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={String(form.month)} onValueChange={(v) => setForm((f) => ({ ...f, month: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select value={String(form.year)} onValueChange={(v) => setForm((f) => ({ ...f, year: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Filter by Department</Label>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Employee</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search employees..." className="mb-2 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={form.employeeId} onValueChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {filteredEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.employee_id} — {emp.name} ({emp.department})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isDuplicate && (
              <Alert className="border-destructive/30 bg-destructive/5">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <AlertDescription className="text-destructive">
                  This employee already has an evaluation for {MONTH_NAMES[form.month - 1]} {form.year}. Edit it from the list below instead.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center justify-between">
                  <span>Safety Marks</span>
                  <span className="text-muted-foreground">max {maxMarks}</span>
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={maxMarks}
                  step="0.5"
                  value={form.marks}
                  onChange={(e) => setForm((f) => ({ ...f, marks: e.target.value }))}
                />
                <div className="text-xs font-medium text-accent">{form.marks || '0'}</div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.min(100, (marksVal / maxMarks) * 100)}%` }} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center justify-between">
                  <span>Negative Marks</span>
                  <span className="text-destructive">deduction</span>
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={form.negative_marks}
                  onChange={(e) => setForm((f) => ({ ...f, negative_marks: e.target.value }))}
                />
                <div className="text-xs font-medium text-destructive">-{form.negative_marks || '0'}</div>
              </div>
            </div>

            {negativeReasons.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Quick add negative deduction</Label>
                <div className="flex flex-wrap gap-2">
                  {negativeReasons.map((r) => (
                    <Button
                      key={r.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addNegativeReason(r)}
                      className="text-destructive hover:bg-destructive/5"
                    >
                      {r.reason} <span className="ml-1 font-bold">-{r.deduction_marks}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea
                id="remarks"
                placeholder="Optional notes about this evaluation..."
                value={form.remarks}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={saving || isDuplicate} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> {editingId ? 'Update' : 'Save'} Evaluation</>}
              </Button>
              {editingId && <Button type="button" variant="outline" onClick={resetForm}>Cancel Edit</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">Existing Evaluations</CardTitle>
          <CardDescription>{MONTH_NAMES[form.month - 1]} {form.year} — {filteredExisting.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredExisting.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No evaluations for this month yet</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {existingPaged.map((ev: any) => {
                  const categoryMarks = Number(ev.safety_marks);
                  return (
                    <div key={ev.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium text-sm">{ev.employees?.name ?? 'Unknown'}</div>
                        <div className="text-xs text-muted-foreground">{ev.employees?.employee_id} · {ev.employees?.department}</div>
                      </div>
                      <Badge variant="secondary" className="font-bold text-accent">
                        {categoryMarks}
                      </Badge>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(ev)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(ev)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {pageCount > 1 && (
                <div className="flex items-center justify-between pt-3">
                  <p className="text-xs text-muted-foreground">Page {page + 1} of {pageCount}</p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
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
