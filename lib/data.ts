'use client';

import { supabase } from './supabase/client';
import { AuditLog } from './types';

export async function logAudit(
  action: string,
  entity: string,
  entity_id: string | null,
  details: string,
  actorEmail?: string | null
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({
      actor_id: user?.id ?? null,
      actor_email: actorEmail ?? user?.email ?? null,
      action,
      entity,
      entity_id,
      details,
    });
  } catch (e) {
    console.error('Failed to log audit event:', e);
  }
}

export interface RankedRow {
  evaluation_id: string;
  employee_id: string;
  employee_code: string;
  name: string;
  photo: string | null;
  department: string;
  designation: string | null;
  joining_date: string;
  department_marks: number;
  hr_marks: number;
  safety_marks: number;
  negative_marks: number;
  total_marks: number;
  remarks: string | null;
  rank: number;
}

export interface RawEvaluationRow {
  evaluation_id: string;
  employee_id: string;
  employee_code: string;
  name: string;
  photo: string | null;
  department: string;
  designation: string | null;
  joining_date: string;
  department_marks: number;
  hr_marks: number;
  safety_marks: number;
  negative_marks: number;
  total_marks: number;
  remarks: string | null;
}

const RANK_SELECT = `
  evaluation_id:id,
  employee_id,
  department_marks,
  hr_marks,
  safety_marks,
  negative_marks,
  total_marks,
  remarks,
  employees!inner (
    employee_code:employee_id,
    name,
    photo,
    department,
    designation,
    joining_date
  )
`;

export async function fetchRankedEvaluations(month: number, year: number): Promise<RankedRow[]> {
  const { data, error } = await supabase
    .from('evaluations')
    .select(RANK_SELECT)
    .eq('month', month)
    .eq('year', year);

  if (error) throw error;

  const rows = (data ?? []) as unknown as RawEvaluationRow[];
  return computeRanks(rows);
}

export function computeRanks(rows: RawEvaluationRow[]): RankedRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.total_marks !== a.total_marks) return b.total_marks - a.total_marks;
    if (b.safety_marks !== a.safety_marks) return b.safety_marks - a.safety_marks;
    if (b.hr_marks !== a.hr_marks) return b.hr_marks - a.hr_marks;
    return new Date(a.joining_date).getTime() - new Date(b.joining_date).getTime();
  });

  return sorted.map((row, idx) => ({
    ...row,
    rank: idx + 1,
  }));
}

export async function fetchAuditLogs(limit = 100): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as AuditLog[];
}
