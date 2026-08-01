'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Building2, Boxes, Warehouse, FlaskConical, Droplets, Wrench, Cpu,
  Plus, Pencil, Trash2, Loader2, ChevronRight, Users, ClipboardCheck, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { logAudit } from '@/lib/data';
import { DepartmentRecord, Employee, Department } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

const ICON_MAP: Record<string, React.ElementType> = {
  Building2, Boxes, Warehouse, FlaskConical, Droplets, Wrench, Cpu,
};

const ICON_CHOICES = [
  { value: 'Boxes', label: 'Boxes (MRP)' },
  { value: 'Warehouse', label: 'Warehouse' },
  { value: 'FlaskConical', label: 'Flask (Emulsion)' },
  { value: 'Droplets', label: 'Droplets (Solvent)' },
  { value: 'Wrench', label: 'Wrench (Maintenance)' },
  { value: 'Cpu', label: 'CPU (Technical)' },
];

export function DepartmentsClient() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [empCounts, setEmpCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRecord | null>(null);
  const [form, setForm] = useState({ code: '', name: '', description: '', icon: 'Building2', status: 'Active' as 'Active' | 'Inactive' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [deptRes, empRes] = await Promise.all([
      supabase.from('departments').select('*').order('created_at', { ascending: true }),
      supabase.from('employees').select('department'),
    ]);
    if (deptRes.data) setDepartments(deptRes.data as DepartmentRecord[]);
    if (empRes.data) {
      const counts: Record<string, number> = {};
      (empRes.data as Employee[]).forEach((e) => { counts[e.department] = (counts[e.department] || 0) + 1; });
      setEmpCounts(counts);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm({ code: '', name: '', description: '', icon: 'Building2', status: 'Active' });
    setDialogOpen(true);
  };

  const openEdit = (d: DepartmentRecord) => {
    setEditing(d);
    setForm({ code: d.code, name: d.name, description: d.description ?? '', icon: d.icon, status: d.status });
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) { toast({ title: 'Code and name are required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim() as Department,
        name: form.name.trim(),
        description: form.description.trim() || null,
        icon: form.icon,
        status: form.status,
      };
      if (editing) {
        const { error } = await supabase.from('departments').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('UPDATE', 'department', editing.id, `Updated department ${form.name}`, profile?.email);
        toast({ title: 'Department updated' });
      } else {
        const { error } = await supabase.from('departments').insert(payload);
        if (error) throw error;
        await logAudit('CREATE', 'department', null, `Created department ${form.name}`, profile?.email);
        toast({ title: 'Department added' });
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('departments').delete().eq('id', deleteTarget.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('DELETE', 'department', deleteTarget.id, `Deleted department ${deleteTarget.name}`, profile?.email);
    toast({ title: 'Department deleted' });
    setDeleteTarget(null);
    load();
  };

  const toggleStatus = async (d: DepartmentRecord) => {
    const newStatus = d.status === 'Active' ? 'Inactive' : 'Active';
    const { error } = await supabase.from('departments').update({ status: newStatus }).eq('id', d.id);
    if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('UPDATE', 'department', d.id, `Toggled ${d.name} to ${newStatus}`, profile?.email);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Departments</h1>
          <p className="text-sm text-muted-foreground">
            Participating departments in the Safety Championship — evaluation performed jointly by HR &amp; Safety
          </p>
        </div>
        {isAdmin && <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add Department</Button>}
      </div>

      {/* Info banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm text-muted-foreground">
            Each department has its own sub-module page showing its employees and evaluation performance.
            Click a department card to view details. Department Heads award up to <span className="font-semibold text-foreground">45 marks</span>,
            HR awards up to <span className="font-semibold text-foreground">25 marks</span>, and Safety awards up to <span className="font-semibold text-foreground">30 marks</span>.
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : departments.length === 0 ? (
        <Card><CardContent className="flex h-40 flex-col items-center justify-center"><Building2 className="mb-2 h-10 w-10 text-muted-foreground/40" /><p className="text-sm text-muted-foreground">No departments found</p></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((d, idx) => {
            const Icon = ICON_MAP[d.icon] || Building2;
            const count = empCounts[d.code] || 0;
            return (
              <Card key={d.id} className="group relative overflow-hidden transition-all hover:shadow-lg animate-fade-in" style={{ animationDelay: `${idx * 0.05}s` }}>
                <div className="h-1.5 w-full bg-gradient-primary" />
                <CardContent className="p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <Badge variant={d.status === 'Active' ? 'default' : 'outline'} className={d.status === 'Active' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}>
                      {d.status}
                    </Badge>
                  </div>
                  <h3 className="text-lg font-bold">{d.name}</h3>
                  {d.description && <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>}
                  <div className="mt-4 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-4 w-4" /> {count} {count === 1 ? 'employee' : 'employees'}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <Link href={`/departments/${d.code}`}>
                      <Button variant="outline" size="sm" className="group-hover:bg-primary group-hover:text-primary-foreground">
                        View Details <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </Link>
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleStatus(d)}>
                          {d.status === 'Active' ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(d)}><Trash2 className="h-4 w-4" /></Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Department' : 'Add Department'}</DialogTitle>
            <DialogDescription>{editing ? 'Update department information' : 'Create a new participating department'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Department Code *</Label>
              <Input id="code" placeholder="e.g. MRP" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} required disabled={!!editing} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Display Name *</Label>
              <Input id="name" placeholder="e.g. Material Requirements Planning" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" placeholder="Short description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select value={form.icon} onValueChange={(v) => setForm((f) => ({ ...f, icon: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ICON_CHOICES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v: 'Active' | 'Inactive') => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Save' : 'Add'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Department?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes "{deleteTarget?.name}" from the department list. Employees already assigned to this department are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
