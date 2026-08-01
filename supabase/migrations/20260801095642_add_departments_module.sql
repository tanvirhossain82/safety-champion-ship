/*
# Departments module - seed department records

## Overview
Seeds six department records into a new `departments` table so each department
(MRP, Warehouse, Emulsion, Solvent, Maintenance, Technical) has its own manageable
sub-module page showing its employees and evaluations. The seed data is idempotent.

## New Table
- `departments` — one row per participating department with a code, display name,
  description, icon identifier, and active status.

## Security (RLS)
- RLS enabled; all authenticated users can read (the app shows department pages to
  every signed-in role). Only admins can insert/update/delete.
*/
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'Building2',
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "departments_select_all" ON public.departments;
CREATE POLICY "departments_select_all"
ON public.departments FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "departments_insert_admin" ON public.departments;
CREATE POLICY "departments_insert_admin"
ON public.departments FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "departments_update_admin" ON public.departments;
CREATE POLICY "departments_update_admin"
ON public.departments FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "departments_delete_admin" ON public.departments;
CREATE POLICY "departments_delete_admin"
ON public.departments FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Seed the six participating departments (idempotent)
INSERT INTO public.departments (code, name, description, icon)
SELECT 'MRP', 'MRP', 'Material Requirements Planning department', 'Boxes'
WHERE NOT EXISTS (SELECT 1 FROM public.departments WHERE code = 'MRP');

INSERT INTO public.departments (code, name, description, icon)
SELECT 'Warehouse', 'Warehouse', 'Warehouse operations and storage department', 'Warehouse'
WHERE NOT EXISTS (SELECT 1 FROM public.departments WHERE code = 'Warehouse');

INSERT INTO public.departments (code, name, description, icon)
SELECT 'Emulsion', 'Emulsion', 'Emulsion production department', 'FlaskConical'
WHERE NOT EXISTS (SELECT 1 FROM public.departments WHERE code = 'Emulsion');

INSERT INTO public.departments (code, name, description, icon)
SELECT 'Solvent', 'Solvent', 'Solvent production department', 'Droplets'
WHERE NOT EXISTS (SELECT 1 FROM public.departments WHERE code = 'Solvent');

INSERT INTO public.departments (code, name, description, icon)
SELECT 'Maintenance', 'Maintenance', 'Equipment maintenance department', 'Wrench'
WHERE NOT EXISTS (SELECT 1 FROM public.departments WHERE code = 'Maintenance');

INSERT INTO public.departments (code, name, description, icon)
SELECT 'Technical', 'Technical', 'Technical support and engineering department', 'Cpu'
WHERE NOT EXISTS (SELECT 1 FROM public.departments WHERE code = 'Technical');
