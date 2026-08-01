'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardCheck, Save, Loader2, Search, AlertCircle, CheckCircle2, Trash2, Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { logAudit } from '@/lib/data';
import { Employee, Evaluation, Department, DEPARTMENTS, MONTH_NAMES, NegativeReason } from '@/lib/types';
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
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ROLE_PERMISSIONS } from '@/lib/types';

interface EvalForm {
  employeeId: string;
  month: number;
  year: number;
  department_marks: string;
  hr_marks: string;
  safety_marks: string;
  negative_marks: string;
  remarks: string;
}

export function EvaluationClient() {
  const { profile, can } = useAuth();
  const now = new Date();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [negativeReasons, setNegativeReasons] = useState<NegativeReason[]>([]);
  const [form, setForm] = useState<EvalForm>({
    employeeId: '',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    department_marks: '0',
    hr_marks: '0',
    safety_marks: '0',
    negative_marks: '0',
    remarks: '',
  });
  const [search, setSearch] = useState('');
  const [existing, setExisting] = useState<Evaluation[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
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

  const computedTotal = useMemo(() => {
    const d = parseFloat(form.department_marks) || 0;
    const h = parseFloat(form.hr_marks) || 0;
    const s = parseFloat(form.safety_marks) || 0;
    const n = parseFloat(form.negative_marks) || 0;
    return Math.max(0, d + h + s - n);
  }, [form.department_marks, form.hr_marks, form.safety_marks, form.negative_marks]);

  const filteredEmployees = employees.filter((e) => {
    const s = search.toLowerCase();
    return !s || e.name.toLowerCase().includes(s) || e.employee_id.toLowerCase().includes(s);
  });

  const startEdit = (ev: Evaluation) => {
    setEditingId(ev.id);
    setForm({
      employeeId: ev.employee_id,
      month: ev.month,
      year: ev.year,
      department_marks: String(ev.department_marks),
      hr_marks: String(ev.hr_marks),
      safety_marks: String(ev.safety_marks),
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
      department_marks: '0',
      hr_marks: '0',
      safety_marks: '0',
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

    const d = parseFloat(form.department_marks) || 0;
    const h = parseFloat(form.hr_marks) || 0;
    const s = parseFloat(form.safety_marks) || 0;
    const n = parseFloat(form.negative_marks) || 0;

    if (d > 45 || h > 25 || s > 30) {
      toast({ title: 'Marks exceed maximum', description: 'Dept max 45, HR max 25, Safety max 30', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        employee_id: form.employeeId,
        month: form.month,
        year: form.year,
        department_marks: d,
        hr_marks: h,
        safety_marks: s,
        negative_marks: n,
        remarks: form.remarks.trim() || null,
      };
      if (editingId) {
        const { error } = await supabase.from('evaluations').update(payload).eq('id', editingId);
        if (error) throw error;
        await logAudit('UPDATE', 'evaluation', editingId, `Updated evaluation for ${selectedEmployee?.name}`, profile?.email);
        toast({ title: 'Evaluation updated' });
      } else {
        const { error } = await supabase.from('evaluations').insert({ ...payload, created_by: profile?.id });
        if (error) throw error;
        await logAudit('CREATE', 'evaluation', null, `Created evaluation for ${selectedEmployee?.name} (${form.month}/${form.year})`, profile?.email);
        toast({ title: 'Evaluation saved' });
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

  const perms = profile ? ROLE_PERMISSIONS[profile.role] : null;
  const canDelete = perms?.canDeleteEvaluations;

  const existingPaged = existing.slice(page * pageSize, (page + 1) * pageSize);
  const pageCount = Math.ceil(existing.length / pageSize) || 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Monthly Evaluation</h1>
        <p className="text-sm text-muted-foreground">Score employees for {MONTH_NAMES[form.month - 1]} {form.year}</p>
      </div>

      {/* Role permissions banner */}
      {profile && (
        <Alert className="border-primary/20 bg-primary/5">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            <span className="font-medium">Your role: {profile.role === 'dept_head' ? 'Department Head' : profile.role.toUpperCase()}</span>
            {' — '}
            {profile.role === 'admin' && 'You can enter all score types (Department, HR, Safety).'}
            {profile.role === 'hr' && 'You can enter HR marks only.'}
            {profile.role === 'safety' && 'You can enter Safety marks only.'}
            {profile.role === 'dept_head' && 'You can enter Department marks only.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Form */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              {editingId ? 'Edit Evaluation' : 'New Evaluation'}
            </CardTitle>
            <CardDescription>Enter marks and any negative deductions</CardDescription>
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

              {/* Score inputs */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <ScoreInput
                  label="Dept Marks" max={45} value={form.department_marks}
                  onChange={(v) => setForm((f) => ({ ...f, department_marks: v }))}
                  disabled={profile ? !can('canEvaluateDept') : false}
                  color="text-primary"
                />
                <ScoreInput
                  label="HR Marks" max={25} value={form.hr_marks}
                  onChange={(v) => setForm((f) => ({ ...f, hr_marks: v }))}
                  disabled={profile ? !can('canEvaluateHR') : false}
                  color="text-chart-3"
                />
                <ScoreInput
                  label="Safety Marks" max={30} value={form.safety_marks}
                  onChange={(v) => setForm((f) => ({ ...f, safety_marks: v }))}
                  disabled={profile ? !can('canEvaluateSafety') : false}
                  color="text-accent"
                />
                <ScoreInput
                  label="Negative" max={100} value={form.negative_marks}
                  onChange={(v) => setForm((f) => ({ ...f, negative_marks: v }))}
                  disabled={false}
                  color="text-destructive"
                  isNegative
                />
              </div>

              {/* Quick negative reasons */}
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

              {/* Total preview */}
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                <div>
                  <div className="text-sm text-muted-foreground">Calculated Total</div>
                  <div className="text-2xl font-bold">{computedTotal} <span className="text-sm font-normal text-muted-foreground">/ 100</span></div>
                </div>
                <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-primary transition-all duration-500" style={{ width: `${Math.min(100, computedTotal)}%` }} />
                </div>
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
            <CardDescription>{MONTH_NAMES[form.month - 1]} {form.year} — {existing.length} total</CardDescription>
          </CardHeader>
          <CardContent>
            {existing.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No evaluations for this month yet</p>
              </div>
            ) : (
            <>
              <div className="space-y-2">
                {existingPaged.map((ev: any) => (
                  <div key={ev.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium text-sm">{ev.employees?.name ?? 'Unknown'}</div>
                      <div className="text-xs text-muted-foreground">{ev.employees?.employee_id} · {ev.employees?.department}</div>
                    </div>
                    <Badge variant="secondary" className="font-bold">{Number(ev.total_marks)}</Badge>
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
                ))}
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
    </div>
  );
}

function ScoreInput({ label, max, value, onChange, disabled, color, isNegative }: {
  label: string; max: number; value: string; onChange: (v: string) => void; disabled: boolean; color: string; isNegative?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center justify-between">
        <span>{label}</span>
        <span className="text-muted-foreground">max {max}</span>
      </Label>
      <Input
        type="number"
        min={0}
        max={max}
        step="0.5"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={disabled ? 'opacity-50' : ''}
      />
      <div className={`text-xs font-medium ${color}`}>
        {isNegative ? '-' : ''}{value || '0'}
      </div>
    </div>
  );
}
