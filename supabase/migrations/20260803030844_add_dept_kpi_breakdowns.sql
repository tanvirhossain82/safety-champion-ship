/*
# Add Department KPI Breakdowns Table

Each department has its own KPI criteria (max 45 marks total).
This table stores the per-criterion breakdown behind the department_marks field in evaluations.

## New Tables
- `dept_kpi_breakdowns`
  - `id` (uuid, primary key)
  - `employee_id` (uuid, FK to employees)
  - `month` (int)
  - `year` (int)
  - `department` (text)
  - `criteria` (jsonb) — array of {name, max, score}
  - `total` (numeric) — sum of all criterion scores
  - `created_by` (uuid, nullable)
  - `created_at` (timestamptz)
  - Unique constraint on (employee_id, month, year)

## Security
- RLS enabled, authenticated users can CRUD.
*/

CREATE TABLE IF NOT EXISTS dept_kpi_breakdowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  year int NOT NULL CHECK (year >= 2020),
  department text NOT NULL,
  criteria jsonb NOT NULL DEFAULT '[]',
  total numeric(6,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (employee_id, month, year)
);

ALTER TABLE dept_kpi_breakdowns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_kpi" ON dept_kpi_breakdowns;
CREATE POLICY "auth_select_kpi" ON dept_kpi_breakdowns FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_kpi" ON dept_kpi_breakdowns;
CREATE POLICY "auth_insert_kpi" ON dept_kpi_breakdowns FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_kpi" ON dept_kpi_breakdowns;
CREATE POLICY "auth_update_kpi" ON dept_kpi_breakdowns FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_kpi" ON dept_kpi_breakdowns;
CREATE POLICY "auth_delete_kpi" ON dept_kpi_breakdowns FOR DELETE
  TO authenticated USING (true);
