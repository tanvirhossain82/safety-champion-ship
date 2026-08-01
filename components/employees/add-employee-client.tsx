'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  UserPlus, Loader2, Upload, X, FileSpreadsheet, Download,
  CheckCircle2, AlertTriangle, ArrowLeft, Users,
} from 'lucide-react';
import { supabase, STORAGE_BUCKET } from '@/lib/supabase/client';
import { logAudit } from '@/lib/data';
import { Department, DEPARTMENTS } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

export function AddEmployeeClient() {
  const { profile } = useAuth();
  const [mode, setMode] = useState<'manual' | 'excel'>('manual');

  // Manual add
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lastAdded, setLastAdded] = useState<{ name: string; employee_id: string; department: string } | null>(null);

  // Excel import
  const [importFileName, setImportFileName] = useState('');
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const handlePhotoUpload = async (file: File) => {
    setUploadingPhoto(true);
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
      setUploadingPhoto(false);
    }
  };

  const resetForm = (keepDepartment?: Department) => {
    setForm({ ...emptyForm, department: keepDepartment ?? emptyForm.department });
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
      const { error } = await supabase.from('employees').insert(payload);
      if (error) throw error;
      await logAudit('CREATE', 'employee', null, `Added employee ${form.name} (${form.employee_id}) to ${form.department}`, profile?.email);
      toast({ title: 'Employee added', description: `${form.name} added to ${form.department}` });
      setLastAdded({ name: form.name, employee_id: form.employee_id, department: form.department });
      resetForm(form.department);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
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

      const { data: existingEmps } = await supabase.from('employees').select('employee_id');
      const existingIds = new Set((existingEmps ?? []).map((e: any) => String(e.employee_id).toLowerCase()));
      const seenIds = new Set<string>();

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

      setImportRows([]);
      setImportFileName('');
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
          <h1 className="text-2xl font-bold tracking-tight">Add Employee</h1>
          <p className="text-sm text-muted-foreground">Add a single employee, or bulk-import from an Excel file</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/employees"><Users className="mr-2 h-4 w-4" /> View All Employees</Link>
        </Button>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as 'manual' | 'excel')}>
        <TabsList className="grid w-full grid-cols-2 sm:w-[360px]">
          <TabsTrigger value="manual"><UserPlus className="mr-1.5 h-4 w-4" /> Manual Add</TabsTrigger>
          <TabsTrigger value="excel"><FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel Import</TabsTrigger>
        </TabsList>

        {/* Manual add */}
        <TabsContent value="manual" className="mt-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><UserPlus className="h-5 w-5 text-primary" /> New Employee</CardTitle>
                <CardDescription>Fill in the employee's details below</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-20 w-20 border-2 border-border">
                      <AvatarImage src={form.photo ?? undefined} />
                      <AvatarFallback className="bg-muted">
                        {form.name ? getInitials(form.name) : <Upload className="h-6 w-6 text-muted-foreground" />}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <Label htmlFor="add-photo" className="mb-1 block">Photo</Label>
                      <div className="flex gap-2">
                        <label htmlFor="add-photo">
                          <Button type="button" variant="outline" size="sm" asChild disabled={uploadingPhoto}>
                            <span>{uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="mr-1 h-4 w-4" /> Upload</>}</span>
                          </Button>
                        </label>
                        {form.photo && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, photo: null }))}>
                            <X className="mr-1 h-4 w-4" /> Remove
                          </Button>
                        )}
                        <Input id="add-photo" type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }} />
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

                  <div className="flex gap-2">
                    <Button type="submit" disabled={saving} className="flex-1">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="mr-2 h-4 w-4" /> Add Employee</>}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => resetForm()}>Clear</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Recently Added</CardTitle>
                <CardDescription>This session</CardDescription>
              </CardHeader>
              <CardContent>
                {lastAdded ? (
                  <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{lastAdded.name}</div>
                      <div className="text-xs text-muted-foreground">{lastAdded.employee_id} · {lastAdded.department}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-32 flex-col items-center justify-center text-center">
                    <UserPlus className="mb-2 h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">Employees you add will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Excel import */}
        <TabsContent value="excel" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><FileSpreadsheet className="h-5 w-5 text-primary" /> Bulk Import</CardTitle>
              <CardDescription>
                Upload a spreadsheet with columns: Employee ID, Name, Department, Designation, Joining Date, Status. Each row is validated and assigned to its department automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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

                  <div className="max-h-96 overflow-auto rounded-lg border">
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

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => { setImportRows([]); setImportFileName(''); }}>
                      Clear
                    </Button>
                    <Button
                      type="button"
                      onClick={handleImportConfirm}
                      disabled={importing || importRows.filter((r) => r.valid).length === 0}
                    >
                      {importing
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : `Import ${importRows.filter((r) => r.valid).length || ''} Employee${importRows.filter((r) => r.valid).length === 1 ? '' : 's'}`}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function getInitials(name: string): string {
  return name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
}
