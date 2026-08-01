'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Search, Pencil, Trash2, Loader2, Upload, X, UserCheck,
  FileSpreadsheet, Download, CheckCircle2, AlertCircle,
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

interface ImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
  byDept: Record<string, number>;
}

// Normalize a raw department string from Excel to a valid Department code
function normalizeDepartment(raw: unknown): Department | null {
  if (raw == null) return null;
  const val = String(raw).trim().toLowerCase();
  const match = DEPARTMENTS.find((d) => d.toLowerCase() === val);
  return match ?? null;
}

// Convert an Excel cell (Date, serial number, or string) to yyyy-MM-dd
function parseExcelDate(raw: unknown): string {
  if (raw instanceof Date && !isNaN(raw.getTime())) return format(raw, 'yyyy-MM-dd');
  if (typeof raw === 'string' && raw.trim()) {
    const d = new Date(raw.trim());
    if (!isNaN(d.getTime())) return format(d, 'yyyy-MM-dd');
  }
  return format(new Date(), 'yyyy-MM-dd');
}

// Read a value from a row by trying several possible header names (case-insensitive)
function pick(row: Record<string, unknown>, keys: string[]): unknown {
  const lowerMap: Record<string, unknown> = {};
  Object.keys(row).forEach((k) => { lowerMap[k.trim().toLowerCase()] = row[k]; });
  for (const key of keys) {
    const v = lowerMap[key.toLowerCase()];
    if (v != null && String(v).trim() !== '') return v;
  }
  return undefined;
}

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

  // Excel bulk import
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

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

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const sample = [
      { 'Employee ID': 'EMP-001', Name: 'John Doe', Department: 'MRP', Designation: 'Operator', 'Joining Date': '2024-01-15', Status: 'Active' },
      { 'Employee ID': 'EMP-002', Name: 'Jane Smith', Department: 'Warehouse', Designation: 'Supervisor', 'Joining Date': '2023-06-01', Status: 'Active' },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    ws['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'employee-import-template.xlsx');
  };

  const handleExcelImport = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

      const result: ImportResult = { inserted: 0, skipped: 0, errors: [], byDept: {} };
      const payloads: any[] = [];
      const seenIds = new Set<string>();

      rows.forEach((row, i) => {
        const line = i + 2; // account for header row
        const empId = String(pick(row, ['Employee ID', 'employee_id', 'emp id', 'id', 'code']) ?? '').trim();
        const name = String(pick(row, ['Name', 'full name', 'employee name']) ?? '').trim();
        const dept = normalizeDepartment(pick(row, ['Department', 'dept']));
        const designation = String(pick(row, ['Designation', 'title', 'position']) ?? '').trim();
        const joining = parseExcelDate(pick(row, ['Joining Date', 'joining_date', 'join date', 'doj']));
        const statusRaw = String(pick(row, ['Status']) ?? 'Active').trim().toLowerCase();
        const status: 'Active' | 'Inactive' = statusRaw === 'inactive' ? 'Inactive' : 'Active';

        if (!empId || !name || !dept) {
          result.skipped++;
          result.errors.push(`Row ${line}: missing ${!empId ? 'Employee ID' : !name ? 'Name' : 'valid Department'}`);
          return;
        }
        if (seenIds.has(empId)) {
          result.skipped++;
          result.errors.push(`Row ${line}: duplicate Employee ID "${empId}" in file`);
          return;
        }
        seenIds.add(empId);
        payloads.push({
          employee_id: empId,
          name,
          department: dept,
          designation: designation || null,
          joining_date: joining,
          status,
          photo: null,
        });
        result.byDept[dept] = (result.byDept[dept] ?? 0) + 1;
      });

      if (payloads.length > 0) {
        // Upsert so re-importing updates existing employees instead of failing on unique employee_id
        const { data, error } = await supabase
          .from('employees')
          .upsert(payloads, { onConflict: 'employee_id' })
          .select('id');
        if (error) throw error;
        result.inserted = data?.length ?? payloads.length;
        await logAudit(
          'IMPORT', 'employee', null,
          `Imported ${result.inserted} employees from Excel (${Object.entries(result.byDept).map(([d, n]) => `${d}: ${n}`).join(', ')})`,
          profile?.email,
        );
      }

      setImportResult(result);
      if (result.inserted > 0) {
        toast({ title: `Imported ${result.inserted} employees`, description: result.skipped ? `${result.skipped} rows skipped` : 'All rows imported successfully' });
        loadEmployees();
      } else {
        toast({ title: 'No employees imported', description: 'Check the file format and required columns', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Employee Management</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add, edit and import employee records across all departments</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { setImportResult(null); setImportOpen(true); }}>
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

      {/* Excel import dialog */}
      <Dialog open={importOpen} onOpenChange={(open) => { if (!importing) setImportOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" /> Import Employees from Excel
            </DialogTitle>
            <DialogDescription>
              Upload an .xlsx/.csv file. Employees are added to their department automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Required columns</p>
              <p className="mt-1 text-muted-foreground">
                <span className="font-medium text-foreground">Employee ID</span>, <span className="font-medium text-foreground">Name</span>, <span className="font-medium text-foreground">Department</span> (MRP, Warehouse, Emulsion, Solvent, Maintenance, Technical). Optional: Designation, Joining Date, Status.
              </p>
              <Button type="button" variant="link" className="mt-1 h-auto p-0 text-xs" onClick={downloadTemplate}>
                <Download className="mr-1 h-3 w-3" /> Download template
              </Button>
            </div>

            {!importResult ? (
              <label
                htmlFor="excel-file"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Importing, please wait...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium">Click to choose an Excel file</span>
                    <span className="text-xs text-muted-foreground">.xlsx, .xls or .csv</span>
                  </>
                )}
                <Input
                  id="excel-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleExcelImport(f); e.target.value = ''; }}
                />
              </label>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                  <div className="text-sm">
                    <span className="font-semibold">{importResult.inserted}</span> employees imported
                    {importResult.skipped > 0 && <span className="text-muted-foreground"> · {importResult.skipped} skipped</span>}
                  </div>
                </div>

                {Object.keys(importResult.byDept).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(importResult.byDept).map(([d, n]) => (
                      <Badge key={d} variant="secondary">{d}: {n}</Badge>
                    ))}
                  </div>
                )}

                {importResult.errors.length > 0 && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                    <div className="mb-1 flex items-center gap-2 text-sm font-medium text-amber-700">
                      <AlertCircle className="h-4 w-4" /> {importResult.errors.length} rows skipped
                    </div>
                    <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                      {importResult.errors.slice(0, 30).map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            {importResult ? (
              <>
                <Button variant="outline" onClick={() => setImportResult(null)}>Import Another</Button>
                <Button onClick={() => setImportOpen(false)}>Done</Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>Cancel</Button>
            )}
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
