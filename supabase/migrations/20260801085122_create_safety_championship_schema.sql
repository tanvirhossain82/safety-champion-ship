/*
# Safety Championship Management System - Core Schema

## Overview
Creates the complete database structure for the Safety Championship Management System.
Employees from six departments (MRP, Warehouse, Emulsion, Solvent, Maintenance, Technical)
are evaluated monthly by Department Heads (45 marks), HR (25 marks), and Safety (30 marks),
with negative deductions. The system ranks employees and crowns a Champion, Runner-up,
and 3rd Position each month.

## New Tables
1. `profiles` - Extends auth.users with a role (admin, hr, safety, dept_head) and department.
2. `employees` - Employee records with photo, department, designation, joining date, status.
3. `evaluations` - Monthly evaluation per employee (dept/hr/safety marks, negative marks, total).
4. `negative_reasons` - Admin-defined negative mark reasons (e.g. No PPE = -5).
5. `audit_logs` - Tracks create/update/delete actions across the app for accountability.

## Security (RLS)
- All tables have RLS ENABLED.
- All policies are scoped TO authenticated (this app requires sign-in).
- profiles: each user reads/updates their own profile row; admins can read all.
- employees: all authenticated users can read; only admins can insert/update/delete.
- evaluations: all authenticated users can read; admin/hr/safety/dept_head can insert/update; admin can delete.
- negative_reasons: all authenticated can read; only admin can write.
- audit_logs: all authenticated can read; any authenticated can insert (logging); no update/delete.

## Important Notes
1. A trigger auto-creates a `profiles` row when a new auth.users row is added.
2. Default role for new sign-ups is 'dept_head' (least privilege) — an admin promotes users.
3. Evaluations have a unique constraint on (employee_id, month, year) to prevent duplicates.
4. total_marks is a GENERATED STORED column = department_marks + hr_marks + safety_marks - negative_marks.
*/

-- ============================================================
-- 1. PROFILES (extends auth.users with role + department)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'dept_head'
    CHECK (role IN ('admin', 'hr', 'safety', 'dept_head')),
  department text
    CHECK (department IN ('MRP', 'Warehouse', 'Emulsion', 'Solvent', 'Maintenance', 'Technical') OR department IS NULL),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. EMPLOYEES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL UNIQUE,
  name text NOT NULL,
  photo text,
  department text NOT NULL
    CHECK (department IN ('MRP', 'Warehouse', 'Emulsion', 'Solvent', 'Maintenance', 'Technical')),
  designation text,
  joining_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_department ON public.employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_name ON public.employees(name);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_select_all" ON public.employees;
CREATE POLICY "employees_select_all"
ON public.employees FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "employees_insert_admin" ON public.employees;
CREATE POLICY "employees_insert_admin"
ON public.employees FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "employees_update_admin" ON public.employees;
CREATE POLICY "employees_update_admin"
ON public.employees FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "employees_delete_admin" ON public.employees;
CREATE POLICY "employees_delete_admin"
ON public.employees FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================================
-- 3. EVALUATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  department_marks numeric(5,2) NOT NULL DEFAULT 0 CHECK (department_marks BETWEEN 0 AND 45),
  hr_marks numeric(5,2) NOT NULL DEFAULT 0 CHECK (hr_marks BETWEEN 0 AND 25),
  safety_marks numeric(5,2) NOT NULL DEFAULT 0 CHECK (safety_marks BETWEEN 0 AND 30),
  negative_marks numeric(5,2) NOT NULL DEFAULT 0 CHECK (negative_marks >= 0),
  remarks text,
  total_marks numeric(6,2) GENERATED ALWAYS AS (department_marks + hr_marks + safety_marks - negative_marks) STORED,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_evaluations_month_year ON public.evaluations(month, year);
CREATE INDEX IF NOT EXISTS idx_evaluations_employee ON public.evaluations(employee_id);

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evaluations_select_all" ON public.evaluations;
CREATE POLICY "evaluations_select_all"
ON public.evaluations FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "evaluations_insert_roles" ON public.evaluations;
CREATE POLICY "evaluations_insert_roles"
ON public.evaluations FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'hr', 'safety', 'dept_head')
  )
);

DROP POLICY IF EXISTS "evaluations_update_roles" ON public.evaluations;
CREATE POLICY "evaluations_update_roles"
ON public.evaluations FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'hr', 'safety', 'dept_head')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'hr', 'safety', 'dept_head')
  )
);

DROP POLICY IF EXISTS "evaluations_delete_admin" ON public.evaluations;
CREATE POLICY "evaluations_delete_admin"
ON public.evaluations FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================================
-- 4. NEGATIVE REASONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.negative_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason text NOT NULL,
  deduction_marks numeric(4,1) NOT NULL DEFAULT 0 CHECK (deduction_marks > 0),
  status text NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.negative_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "negative_reasons_select_all" ON public.negative_reasons;
CREATE POLICY "negative_reasons_select_all"
ON public.negative_reasons FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "negative_reasons_insert_admin" ON public.negative_reasons;
CREATE POLICY "negative_reasons_insert_admin"
ON public.negative_reasons FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "negative_reasons_update_admin" ON public.negative_reasons;
CREATE POLICY "negative_reasons_update_admin"
ON public.negative_reasons FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "negative_reasons_delete_admin" ON public.negative_reasons;
CREATE POLICY "negative_reasons_delete_admin"
ON public.negative_reasons FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================================
-- 5. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  actor_email text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_all" ON public.audit_logs;
CREATE POLICY "audit_logs_select_all"
ON public.audit_logs FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "audit_logs_insert_any" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_any"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================================
-- 6. SEED DEFAULT NEGATIVE REASONS
-- ============================================================
INSERT INTO public.negative_reasons (reason, deduction_marks, status)
SELECT 'Late Attendance', 2.0, 'Active'
WHERE NOT EXISTS (SELECT 1 FROM public.negative_reasons WHERE reason = 'Late Attendance');

INSERT INTO public.negative_reasons (reason, deduction_marks, status)
SELECT 'No PPE', 5.0, 'Active'
WHERE NOT EXISTS (SELECT 1 FROM public.negative_reasons WHERE reason = 'No PPE');

INSERT INTO public.negative_reasons (reason, deduction_marks, status)
SELECT 'Unsafe Behavior', 10.0, 'Active'
WHERE NOT EXISTS (SELECT 1 FROM public.negative_reasons WHERE reason = 'Unsafe Behavior');

INSERT INTO public.negative_reasons (reason, deduction_marks, status)
SELECT 'Violation', 15.0, 'Active'
WHERE NOT EXISTS (SELECT 1 FROM public.negative_reasons WHERE reason = 'Violation');
