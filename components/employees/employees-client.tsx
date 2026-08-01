'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Search, Pencil, Trash2, Loader2, Upload, X, UserCheck,
} from 'lucide-react';
import { supabase, STORAGE_BUCKET } from '@/lib/supabase/client';
import { logAudit } from '@/lib/data';
import { Employee, Department, DEPARTMENTS } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface FormState {
  employee_id: string;
  name: string;
  department: Department;
  designation: string;
  joining_date: string;
  status: 'Active' | 'Inactive';
  photo: string | null;
}

const emptyForm: FormState = {
  employee_id: '',
  name: '',
  department: 'MRP',
  designation: '',
  joining_date: format(new Date(), 'yyyy-MM-dd'),
  status: 'Active',
  photo: null,
};

export function EmployeesClient() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('employees').select('*').order('created_at', { ascending: false });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else setEmployees(data as Employee[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const filtered = employees.filter((e) => {
    const s = search.toLowerCase();
    const matchSearch = !s || e.name.toLowerCase().includes(s) || e.employee_id.toLowerCase().includes(s);
    const matchDept = deptFilter === 'all' || e.department === deptFilter;
    const matchStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchSearch && matchDept && matchStatus;
  });

  const pageCount = Math.ceil(filtered.length / pageSize) || 1;
  const currentData = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setForm({
      employee_id: emp.employee_id,
      name: emp.name,
      department: emp.department,
      designation: emp.designation ?? '',
      joining_date: emp.joining_date,
      status: emp.status,
      photo: emp.photo,
    });
    setDialogOpen(true);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(fileName, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
      setForm((f) => ({ ...f, photo: urlData.publicUrl }));
      toast({ title: 'Photo uploaded' });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employee_id.trim() || !form.name.trim()) {
      toast({ title: 'Employee ID and Name are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        employee_id: form.employee_id.trim(),
        name: form.name.trim(),
        department: form.department,
        designation: form.designation.trim() || null,
        joining_date: form.joining_date,
        status: form.status,
        photo: form.photo,
      };
      if (editing) {
        const { error } = await supabase.from('employees').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('UPDATE', 'employee', editing.id, `Updated employee ${form.name} (${form.employee_id})`, profile?.email);
        toast({ title: 'Employee updated' });
      } else {
        const { error } = await supabase.from('employees').insert(payload);
        if (error) throw error;
        await logAudit('CREATE', 'employee', null, `Created employee ${form.name} (${form.employee_id})`, profile?.email);
        toast({ title: 'Employee added' });
      }
      setDialogOpen(false);
      loadEmployees();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('employees').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      await logAudit('DELETE', 'employee', deleteTarget.id, `Deleted employee ${deleteTarget.name} (${deleteTarget.employee_id})`, profile?.email);
      toast({ title: 'Employee deleted' });
      setDeleteTarget(null);
      loadEmployees();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">Manage employee records across all departments</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Employee
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name or employee ID..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <Select value={deptFilter} onValueChange={(v) => { setDeptFilter(v); setPage(0); }}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-full sm:w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-primary" />
            {filtered.length} {filtered.length === 1 ? 'Employee' : 'Employees'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : currentData.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-center">
              <Users className="mb-2 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No employees found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Photo</TableHead>
                      <TableHead>Emp ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Joining Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentData.map((emp) => (
                      <TableRow key={emp.id} className="hover:bg-muted/50">
                        <TableCell>
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={emp.photo ?? undefined} />
                            <AvatarFallback className="bg-primary/10 text-xs text-primary">
                              {getInitials(emp.name)}
                            </AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell className="font-medium">{emp.employee_id}</TableCell>
                        <TableCell>{emp.name}</TableCell>
                        <TableCell><Badge variant="secondary">{emp.department}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{emp.designation || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{format(new Date(emp.joining_date), 'dd MMM yyyy')}</TableCell>
                        <TableCell>
                          <Badge variant={emp.status === 'Active' ? 'default' : 'outline'} className={emp.status === 'Active' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}>
                            {emp.status === 'Active' && <UserCheck className="mr-1 h-3 w-3" />}
                            {emp.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(emp)} className="h-8 w-8">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(emp)} className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {pageCount > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {page + 1} of {pageCount} ({filtered.length} total)
                  </p>
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

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
            <DialogDescription>{editing ? 'Update employee information' : 'Create a new employee record'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            {/* Photo upload */}
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 border-2 border-border">
                <AvatarImage src={form.photo ?? undefined} />
                <AvatarFallback className="bg-muted">
                  {form.name ? getInitials(form.name) : <Upload className="h-6 w-6 text-muted-foreground" />}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <Label htmlFor="photo" className="mb-1 block">Photo</Label>
                <div className="flex gap-2">
                  <label htmlFor="photo">
                    <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
                      <span>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="mr-1 h-4 w-4" /> Upload</>}</span>
                    </Button>
                  </label>
                  {form.photo && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, photo: null }))}>
                      <X className="mr-1 h-4 w-4" /> Remove
                    </Button>
                  )}
                  <Input id="photo" type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emp_id">Employee ID *</Label>
                <Input id="emp_id" value={form.employee_id} onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department *</Label>
                <Select value={form.department} onValueChange={(v: Department) => setForm((f) => ({ ...f, department: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="designation">Designation</Label>
                <Input id="designation" value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} placeholder="e.g. Operator" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="joining_date">Joining Date *</Label>
                <Input id="joining_date" type="date" value={form.joining_date} onChange={(e) => setForm((f) => ({ ...f, joining_date: e.target.value }))} required />
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
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Save Changes' : 'Add Employee'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteTarget?.name} ({deleteTarget?.employee_id}) and all related evaluations. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function getInitials(name: string): string {
  return name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
}
