export type UserRole = 'admin' | 'hr' | 'safety' | 'dept_head';

export type Department = 'MRP' | 'Warehouse' | 'Emulsion' | 'Solvent' | 'Maintenance' | 'Technical';

export const DEPARTMENTS: Department[] = [
  'MRP',
  'Warehouse',
  'Emulsion',
  'Solvent',
  'Maintenance',
  'Technical',
];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  department: Department | null;
  created_at: string;
}

export interface Employee {
  id: string;
  employee_id: string;
  name: string;
  photo: string | null;
  department: Department;
  designation: string | null;
  joining_date: string;
  status: 'Active' | 'Inactive';
  created_at: string;
}

export interface HrCriteriaBreakdown {
  positive: Record<string, number>;
  negative: Record<string, number>;
}

export interface Evaluation {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  department_marks: number;
  hr_marks: number;
  safety_marks: number;
  negative_marks: number;
  hr_criteria?: HrCriteriaBreakdown | null;
  remarks: string | null;
  total_marks: number;
  created_by: string | null;
  created_at: string;
  employees?: Employee;
}

export interface NegativeReason {
  id: string;
  reason: string;
  deduction_marks: number;
  status: 'Active' | 'Inactive';
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: string | null;
  created_at: string;
}

export interface DepartmentRecord {
  id: string;
  code: Department;
  name: string;
  description: string | null;
  icon: string;
  status: 'Active' | 'Inactive';
  created_at: string;
}

export interface RankedEvaluation extends Evaluation {
  rank: number;
  employees: Employee;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  hr: 'HR Department',
  safety: 'Safety Department',
  dept_head: 'Department Head',
};

export const ROLE_PERMISSIONS: Record<UserRole, {
  canManageEmployees: boolean;
  canManageNegativeReasons: boolean;
  canManageUsers: boolean;
  canEvaluateDept: boolean;
  canEvaluateHR: boolean;
  canEvaluateSafety: boolean;
  canDeleteEvaluations: boolean;
  canViewAuditLog: boolean;
  canViewReports: boolean;
}> = {
  admin: {
    canManageEmployees: true,
    canManageNegativeReasons: true,
    canManageUsers: true,
    canEvaluateDept: true,
    canEvaluateHR: true,
    canEvaluateSafety: true,
    canDeleteEvaluations: true,
    canViewAuditLog: true,
    canViewReports: true,
  },
  hr: {
    canManageEmployees: false,
    canManageNegativeReasons: false,
    canManageUsers: false,
    canEvaluateDept: false,
    canEvaluateHR: true,
    canEvaluateSafety: false,
    canDeleteEvaluations: false,
    canViewAuditLog: false,
    canViewReports: true,
  },
  safety: {
    canManageEmployees: false,
    canManageNegativeReasons: false,
    canManageUsers: false,
    canEvaluateDept: false,
    canEvaluateHR: false,
    canEvaluateSafety: true,
    canDeleteEvaluations: false,
    canViewAuditLog: false,
    canViewReports: true,
  },
  dept_head: {
    canManageEmployees: false,
    canManageNegativeReasons: false,
    canManageUsers: false,
    canEvaluateDept: true,
    canEvaluateHR: false,
    canEvaluateSafety: false,
    canDeleteEvaluations: false,
    canViewAuditLog: false,
    canViewReports: true,
  },
};
