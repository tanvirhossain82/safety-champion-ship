'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Search, Pencil, Trash2, Loader2, Upload, X, UserCheck,
  FileSpreadsheet, ShieldCheck, Download, AlertCircle, CheckCircle2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase, STORAGE_BUCKET } from '@/lib/supabase/client';
import { logAudit } from '@/lib/data';
import { Employee, Department, DEPARTMENTS } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
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

interface ParsedRow {
  employee_id: string;
  name: string;
  department: string;
  designation: string;
  joining_date: string;
  status: string;
  valid: boolean;
  error?: string;
}

export function AdminClient() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Excel bulk upload state
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);

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
    return matchSearch && matchDept;
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

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { EmployeeID: 'EMP001', Name: 'John Doe', Department: 'MRP', Designation: 'Operator', JoiningDate: '2024-01-15', Status: 'Active' },
      { EmployeeID: 'EMP002', Name: 'Jane Smith', Department: 'Warehouse', Designation: 'Supervisor', JoiningDate: '2024-02-01', Status: 'Active' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'employee-template.xlsx');
  };

  const parseExcelFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      const deptMap = new Map(DEPARTMENTS.map((d) => [d.toLowerCase(), d]));

      const flexGet = (row: Record<string, unknown>, ...keys: string[]): string => {
        const rowKeys = Object.keys(row);
        for (const k of keys) {
          const match = rowKeys.find((rk) => rk.trim().toLowerCase() === k.toLowerCase());
          if (match && row[match] != null) return String(row[match]).trim();
        }
        for (const k of keys) {
          const match = rowKeys.find((rk) => rk.trim().toLowerCase().replace(/\s/g, '').includes(k.toLowerCase().replace(/\s/g, '')));
          if (match && row[match] != null) return String(row[match]).trim();
        }
        return '';
      };

      const normalizeDate = (raw: string): string => {
        if (!raw) return format(new Date(), 'yyyy-MM-dd');
        // Excel serial date number (days since 1899-12-30)
        const serial = Number(raw);
        if (!isNaN(serial) && serial > 30000 && serial < 90000) {
          const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
          return format(d, 'yyyy-MM-dd');
        }
        // Try parsing as a normal date string
        const parsed = new Date(raw);
        if (!isNaN(parsed.getTime())) return format(parsed, 'yyyy-MM-dd');
        return raw;
      };

      const rows: ParsedRow[] = json.map((row) => {
        const empId = flexGet(row, 'EmployeeID', 'Employee ID', 'employee_id', 'EmpID', 'Emp ID', 'ID');
        const name = flexGet(row, 'Name', 'Employee Name', 'Full Name', 'FullName', 'name');
        const rawDept = flexGet(row, 'Department', 'Dept', 'Department Name', 'DeptName', 'department');
        const designation = flexGet(row, 'Designation', 'Desig', 'Position', 'Title', 'designation');
        const joining = normalizeDate(flexGet(row, 'JoiningDate', 'Joining Date', 'joining_date', 'JoinDate', 'Join Date', 'Date of Joining'));
        const status = flexGet(row, 'Status', 'Employment Status', 'status') || 'Active';

        const matchedDept = deptMap.get(rawDept.toLowerCase());
        let error: string | undefined;
        if (!empId) error = 'Missing Employee ID';
        else if (!name) error = 'Missing Name';
        else if (!rawDept) error = 'Missing Department';
        else if (!matchedDept) error = `Invalid department "${rawDept}". Valid: ${DEPARTMENTS.join(', ')}`;

        return { employee_id: empId, name, department: matchedDept ?? rawDept, designation, joining_date: joining, status: status || 'Active', valid: !error, error };
      });

      if (rows.length === 0) {
        toast({ title: 'No rows found', description: 'The Excel file appears to be empty', variant: 'destructive' });
        return;
      }

      setParsedRows(rows);
      setBulkResult(null);
      setBulkOpen(true);
    } catch (e: any) {
      toast({ title: 'Failed to read Excel file', description: e.message, variant: 'destructive' });
    }
  };

  const handleBulkImport = async () => {
    const validRows = parsedRows.filter((r) => r.valid);
    if (validRows.length === 0) {
      toast({ title: 'No valid rows to import', variant: 'destructive' });
      return;
    }

    setBulkImporting(true);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of validRows) {
      const payload = {
        employee_id: row.employee_id,
        name: row.name,
        department: row.department as Department,
        designation: row.designation || null,
        joining_date: row.joining_date || format(new Date(), 'yyyy-MM-dd'),
        status: (row.status === 'Active' || row.status === 'Inactive' ? row.status : 'Active') as 'Active' | 'Inactive',
        photo: null,
      };
      const { error } = await supabase.from('employees').insert(payload);
      if (error) {
        failed++;
        errors.push(`${row.employee_id}: ${error.message}`);
      } else {
        success++;
      }
    }

    await logAudit('BULK_IMPORT', 'employee', null, `Bulk imported ${success} employees (${failed} failed)`, profile?.email);
    setBulkResult({ success, failed, errors });
    if (success > 0) loadEmployees();
    setBulkImporting(false);
  };

  const validCount = parsedRows.filter((r) => r.valid).length;
  const invalidCount = parsedRows.length - validCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheck className="h-7 w-7 text-primary" /> Admin
          </h1>
          <p className="text-sm text-muted-foreground">Manage employees and bulk import via Excel</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadTemplate()}>
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>
          <Button variant="outline" onClick={() => { setParsedRows([]); setBulkResult(null); setBulkOpen(true); }}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Upload Excel
          </Button>
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add Employee
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Employees</div><div className="mt-1 text-2xl font-bold">{employees.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Active</div><div className="mt-1 text-2xl font-bold text-green-600">{employees.filter((e) => e.status === 'Active').length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Inactive</div><div className="mt-1 text-2xl font-bold text-muted-foreground">{employees.filter((e) => e.status === 'Inactive').length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Departments</div><div className="mt-1 text-2xl font-bold">{new Set(employees.map((e) => e.department)).size}</div></CardContent></Card>
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
        </CardContent>
      </Card>

      {/* Employee table */}
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
                      <TableHead className="w-12">SL</TableHead>
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
                    {currentData.map((emp, idx) => (
                      <TableRow key={emp.id} className="hover:bg-muted/50">
                        <TableCell className="text-muted-foreground font-medium">{page * pageSize + idx + 1}</TableCell>
                        <TableCell>
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={emp.photo ?? undefined} />
                            <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{getInitials(emp.name)}</AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{emp.employee_id}</TableCell>
                        <TableCell className="font-medium">{emp.name}</TableCell>
                        <TableCell><Badge variant="secondary">{emp.department}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-sm">{emp.designation || '—'}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{format(new Date(emp.joining_date), 'dd MMM yyyy')}</TableCell>
                        <TableCell>
                          <Badge variant={emp.status === 'Active' ? 'default' : 'outline'} className={emp.status === 'Active' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}>
                            {emp.status === 'Active' && <UserCheck className="mr-1 h-3 w-3" />}{emp.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(emp)} className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(emp)} className="h-8 w-8 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {pageCount > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">Page {page + 1} of {pageCount} ({filtered.length} total)</p>
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
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 border-2 border-border">
                <AvatarImage src={form.photo ?? undefined} />
                <AvatarFallback className="bg-muted">{form.name ? getInitials(form.name) : <Upload className="h-6 w-6 text-muted-foreground" />}</AvatarFallback>
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
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, photo: null }))}><X className="mr-1 h-4 w-4" /> Remove</Button>
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
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Save Changes' : 'Add Employee'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Excel Bulk Import dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" /> Bulk Import Employees</DialogTitle>
            <DialogDescription>Upload an Excel file to add employees in bulk, organized by department</DialogDescription>
          </DialogHeader>

          {bulkResult ? (
            <div className="space-y-4">
              <div className={`rounded-lg border p-4 ${bulkResult.failed === 0 ? 'border-green-500/30 bg-green-500/5' : 'border-orange-500/30 bg-orange-500/5'}`}>
                <div className="flex items-center gap-2">
                  {bulkResult.failed === 0 ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-orange-600" />}
                  <span className="font-medium">{bulkResult.success} imported, {bulkResult.failed} failed</span>
                </div>
                {bulkResult.errors.length > 0 && (
                  <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {bulkResult.errors.map((err, i) => <li key={i} className="font-mono">{err}</li>)}
                  </ul>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setBulkResult(null); setParsedRows([]); }}>Import More</Button>
                <Button onClick={() => setBulkOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : parsedRows.length === 0 ? (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) parseExcelFile(f);
                }}
              >
                <FileSpreadsheet className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
                <p className="text-sm font-medium">Drag and drop your Excel file here</p>
                <p className="mt-1 text-xs text-muted-foreground">or click to browse — supports .xlsx, .xls, .csv</p>
                <label className="mt-4 inline-block">
                  <Button type="button" asChild><span><Upload className="mr-2 h-4 w-4" /> Choose File</span></Button>
                  <Input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) parseExcelFile(f); }} />
                </label>
              </div>

              {/* Format guide */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-2 text-sm font-medium">Required columns:</p>
                <div className="flex flex-wrap gap-2">
                  {['EmployeeID', 'Name', 'Department', 'Designation', 'JoiningDate', 'Status'].map((c) => (
                    <Badge key={c} variant="secondary" className="font-mono text-xs">{c}</Badge>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Department must be one of: {DEPARTMENTS.join(', ')}. Status is optional (defaults to Active).
                </p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={downloadTemplate}>
                  <Download className="mr-2 h-3 w-3" /> Download template
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Preview summary */}
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex-1">
                  <div className="text-sm font-medium">{parsedRows.length} rows parsed</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="text-green-600">{validCount} valid</span>
                    {invalidCount > 0 && <span className="ml-2 text-red-600">{invalidCount} with errors</span>}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setParsedRows([]); }}><X className="h-4 w-4" /></Button>
              </div>

              {/* Preview table */}
              <div className="max-h-[300px] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Employee ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Validation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((r, i) => (
                      <TableRow key={i} className={r.valid ? '' : 'bg-red-500/5'}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{r.employee_id || '—'}</TableCell>
                        <TableCell className="text-sm">{r.name || '—'}</TableCell>
                        <TableCell>{r.department ? <Badge variant="secondary" className="text-xs">{r.department}</Badge> : '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.designation || '—'}</TableCell>
                        <TableCell className="text-xs">{r.status}</TableCell>
                        <TableCell>
                          {r.valid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <span className="flex items-center gap-1 text-xs text-red-600"><AlertCircle className="h-3 w-3" /> {r.error}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setParsedRows([]); }}>Cancel</Button>
                <Button onClick={handleBulkImport} disabled={bulkImporting || validCount === 0}>
                  {bulkImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="mr-2 h-4 w-4" /> Import {validCount} Employees</>}
                </Button>
              </DialogFooter>
            </div>
          )}
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
