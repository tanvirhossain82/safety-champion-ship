'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert, Plus, Pencil, Trash2, Loader2, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { logAudit } from '@/lib/data';
import { NegativeReason } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

export function NegativeReasonsClient() {
  const { profile } = useAuth();
  const [reasons, setReasons] = useState<NegativeReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NegativeReason | null>(null);
  const [reason, setReason] = useState('');
  const [deduction, setDeduction] = useState('');
  const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NegativeReason | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('negative_reasons').select('*').order('deduction_marks', { ascending: true });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else setReasons(data as NegativeReason[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setReason('');
    setDeduction('');
    setStatus('Active');
    setDialogOpen(true);
  };

  const openEdit = (r: NegativeReason) => {
    setEditing(r);
    setReason(r.reason);
    setDeduction(String(r.deduction_marks));
    setStatus(r.status);
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || !deduction) { toast({ title: 'Reason and deduction are required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = { reason: reason.trim(), deduction_marks: parseFloat(deduction), status };
      if (editing) {
        const { error } = await supabase.from('negative_reasons').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('UPDATE', 'negative_reason', editing.id, `Updated reason "${reason}"`, profile?.email);
        toast({ title: 'Reason updated' });
      } else {
        const { error } = await supabase.from('negative_reasons').insert(payload);
        if (error) throw error;
        await logAudit('CREATE', 'negative_reason', null, `Created reason "${reason}" (-${deduction})`, profile?.email);
        toast({ title: 'Reason added' });
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
    const { error } = await supabase.from('negative_reasons').delete().eq('id', deleteTarget.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('DELETE', 'negative_reason', deleteTarget.id, `Deleted reason "${deleteTarget.reason}"`, profile?.email);
    toast({ title: 'Reason deleted' });
    setDeleteTarget(null);
    load();
  };

  const toggleStatus = async (r: NegativeReason) => {
    const newStatus = r.status === 'Active' ? 'Inactive' : 'Active';
    const { error } = await supabase.from('negative_reasons').update({ status: newStatus }).eq('id', r.id);
    if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('UPDATE', 'negative_reason', r.id, `Toggled "${r.reason}" to ${newStatus}`, profile?.email);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Negative Mark Reasons</h1>
          <p className="text-sm text-muted-foreground">Define custom deduction reasons for safety violations</p>
        </div>
        <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add Reason</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Deduction Reasons ({reasons.length})
          </CardTitle>
          <CardDescription>Click marks to toggle active/inactive</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : reasons.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-center">
              <ShieldAlert className="mb-2 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No reasons defined yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Deduction</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reasons.map((r) => (
                    <TableRow key={r.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{r.reason}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="font-bold text-destructive border-destructive/30">-{r.deduction_marks}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(r)} className="gap-1">
                          {r.status === 'Active'
                            ? <><ToggleRight className="h-5 w-5 text-green-500" /> <span className="text-green-600">Active</span></>
                            : <><ToggleLeft className="h-5 w-5 text-muted-foreground" /> <span className="text-muted-foreground">Inactive</span></>
                          }
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Reason' : 'Add Reason'}</DialogTitle>
            <DialogDescription>{editing ? 'Update deduction reason' : 'Create a new negative mark reason'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason *</Label>
              <Input id="reason" placeholder="e.g. No PPE" value={reason} onChange={(e) => setReason(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deduction">Deduction Marks *</Label>
              <Input id="deduction" type="number" min="0.5" step="0.5" placeholder="e.g. 5" value={deduction} onChange={(e) => setDeduction(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v: 'Active' | 'Inactive') => setStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Save' : 'Add'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reason?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete "{deleteTarget?.reason}". Existing evaluations keep their recorded values.</AlertDialogDescription>
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
