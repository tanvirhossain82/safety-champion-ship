'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Plus, Search, Pencil, Trash2, Loader2, Upload, X, UserCheck,
  FileSpreadsheet, Download, CheckCircle2, AlertTriangle,
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

interface ImportRow {
  rowNum: number;
  employee_id: string;
  name: string;
  department: string;
  designation: string;
  joining_date: string;
  status: 'Active' | 'Inactive';
  valid: boolean;
  error?: string;
}

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

const IMPORT_HEADER_MAP: Record<string, keyof Omit<ImportRow, 'rowNum' | 'valid' | 'error'>> = {
  employeeid: 'employee_id',
  empid: 'employee_id',
  id: 'employee_id',
  employeecode: 'employee_id',
  name: 'name',
  employeename: 'name',
  fullname: 'name',
  department: 'department',
  dept: 'department',
  designation: 'designation',
  role: 'designation',
  joiningdate: 'joining_date',
  joindate: 'joining_date',
  dateofjoining: 'joining_date',
  status: 'status',
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

  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

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

  const openImport = () => {
    setImportRows([]);
    setImportFileName('');
    setImportOpen(true);
  };

  const parseImportFile = async (file: File) => {
    setParsing(true);
    setImportFileName(file.name);
    setImportRows([]);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', raw: true });

      const seenIds = new Set<string>();
      const existingIds = new Set(employees.map((e) => e.employee_id.toLowerCase()));

      const rows: ImportRow[] = json.map((raw, idx) => {
        const normalized: Partial<Record<keyof Omit<ImportRow, 'rowNum' | 'valid' | 'error'>, string>> = {};
        Object.entries(raw).forEach(([key, val]) => {
          const mapped = IMPORT_HEADER_MAP[normalizeHeader(key)];
          if (!mapped) return;
          if (mapped === 'joining_date' && val instanceof Date) {
            normalized[mapped] = format(val, 'yyyy-MM-dd');
          } else {
            normalized[mapped] = String(val ?? '').trim();
          }
        });

        const employee_id = normalized.employee_id || '';
        const name = normalized.name || '';
        const deptRaw = normalized.department || '';
        const designation = normalized.designation || '';
        const statusRaw = (normalized.status || 'Active').trim();
        const status: 'Active' | 'Inactive' = statusRaw.toLowerCase() === 'inactive' ? 'Inactive' : 'Active';

        let joining_date = normalized.joining_date || '';
        if (!joining_date || isNaN(Date.parse(joining_date))) {
          joining_date = format(new Date(), 'yyyy-MM-dd');
        } else {
          joining_date = format(new Date(joining_date), 'yyyy-MM-dd');
        }

        const deptMatch = DEPARTMENTS.find((d) => d.toLowerCase() === deptRaw.toLowerCase());

        let error: string | undefined;
        if (!employee_id) error = 'Missing Employee ID';
        else if (!name) error = 'Missing Name';
        else if (!deptMatch) error = deptRaw ? `Unknown department "${deptRaw}"` : 'Missing Department';
        else if (existingIds.has(employee_id.toLowerCase())) error = 'Employee ID already exists';
        else if (seenIds.has(employee_id.toLowerCase())) error = 'Duplicate row in file';

        if (!error) seenIds.add(employee_id.toLowerCase());

        return {
          rowNum: idx + 2,
          employee_id,
          name,
          department: deptMatch ?? deptRaw,
          designation,
          joining_date,
          status,
          valid: !error,
          error,
        };
      });

      setImportRows(rows);
      if (rows.length === 0) {
        toast({ title: 'No rows found', description: 'The file appears to be empty.', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Could not read file', description: e.message, variant: 'destructive' });
      setImportRows([]);
    } finally {
      setParsing(false);
    }
  };

  const importByDept = useMemo(() => {
    const counts: Record<string, number> = {};
    importRows.filter((r) => r.valid).forEach((r) => { counts[r.department] = (counts[r.department] ?? 0) + 1; });
    return counts;
  }, [importRows]);

  const handleImportConfirm = async () => {
    const valid = importRows.filter((r) => r.valid);
    if (valid.length === 0) return;
    setImporting(true);
    try {
      const payload = valid.map((r) => ({
        employee_id: r.employee_id,
        name: r.name,
        department: r.department as Department,
        designation: r.designation || null,
        joining_date: r.joining_date,
        status: r.status,
      }));
      const { error } = await supabase.from('employees').insert(payload);
      if (error) throw error;

      const summary = Object.entries(importByDept).map(([d, c]) => `${d}: ${c}`).join(', ');
      await logAudit('IMPORT', 'employee', null, `Bulk imported ${valid.length} employees from Excel (${summary})`, profile?.email);
      toast({ title: `${valid.length} employee${valid.length === 1 ? '' : 's'} imported`, description: summary });

      setImportOpen(false);
      setImportRows([]);
      setImportFileName('');
      loadEmployees();
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const sample = DEPARTMENTS.map((d, i) => ({
      'Employee ID': `${d.slice(0, 3).toUpperCase()}-${1001 + i}`,
      'Name': '',
      'Department': d,
      'Designation': '',
      'Joining Date': format(new Date(), 'yyyy-MM-dd'),
      'Status': 'Active',
    }));
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'employee-import-template.xlsx');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">Manage employee records across all departments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openImport}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Import Excel
          </Button>
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add Employee
          </Button>
        </div>
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

      {/* Import from Excel dialog */}
      <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) { setImportRows([]); setImportFileName(''); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Employees from Excel</DialogTitle>
            <DialogDescription>
              Upload a spreadsheet with columns: Employee ID, Name, Department, Designation, Joining Date, Status. Rows are validated and assigned to their department automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="import-file">
                <Button type="button" variant="outline" size="sm" asChild disabled={parsing}>
                  <span>{parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="mr-1 h-4 w-4" /> Choose File</>}</span>
                </Button>
              </label>
              <Input
                id="import-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) parseImportFile(f); }}
              />
              {importFileName && <span className="text-sm text-muted-foreground">{importFileName}</span>}
              <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate} className="ml-auto">
                <Download className="mr-1 h-4 w-4" /> Download template
              </Button>
            </div>

            {importRows.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    {importRows.filter((r) => r.valid).length} ready to import
                  </Badge>
                  {importRows.some((r) => !r.valid) && (
                    <Badge variant="outline" className="gap-1 border-destructive/30 text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {importRows.filter((r) => !r.valid).length} skipped
                    </Badge>
                  )}
                  {Object.entries(importByDept).map(([d, c]) => (
                    <Badge key={d} variant="outline" className="text-xs">{d}: {c}</Badge>
                  ))}
                </div>

                <div className="max-h-72 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Row</TableHead>
                        <TableHead>Emp ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importRows.map((r) => (
                        <TableRow key={r.rowNum} className={!r.valid ? 'bg-destructive/5' : ''}>
                          <TableCell className="text-xs text-muted-foreground">{r.rowNum}</TableCell>
                          <TableCell className="text-xs">{r.employee_id || '—'}</TableCell>
                          <TableCell className="text-sm">{r.name || '—'}</TableCell>
                          <TableCell className="text-sm">{r.department || '—'}</TableCell>
                          <TableCell className="text-xs">{r.status}</TableCell>
                          <TableCell className="text-xs">
                            {r.valid
                              ? <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> OK</span>
                              : <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {r.error}</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={handleImportConfirm}
              disabled={importing || importRows.filter((r) => r.valid).length === 0}
            >
              {importing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : `Import ${importRows.filter((r) => r.valid).length || ''} Employee${importRows.filter((r) => r.valid).length === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
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
