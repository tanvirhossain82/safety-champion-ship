/*
# First user becomes admin + photo storage bucket

## Changes
1. Updates the `handle_new_user` trigger so the FIRST user to sign up is auto-promoted to
   the 'admin' role. All subsequent users keep the default 'dept_head' role (least privilege),
   which an admin can later promote to hr/safety/dept_head.
2. Creates a public storage bucket `employee-photos` for employee profile pictures and
   grants authenticated users read + write access via storage policies.

## Security
- Storage bucket is public-read (photos shown on dashboard/leaderboard) but write-restricted
  to authenticated users.
*/

-- Make the first registered user an admin automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count integer;
  assigned_role text;
BEGIN
  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'dept_head';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), assigned_role);
  RETURN NEW;
END;
$$;

-- ============================================================
-- Storage bucket for employee photos
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
SELECT 'employee-photos', 'employee-photos', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'employee-photos');

-- Allow public read of photos
DROP POLICY IF EXISTS "employee_photos_public_read" ON storage.objects;
CREATE POLICY "employee_photos_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'employee-photos');

-- Allow authenticated users to upload photos
DROP POLICY IF EXISTS "employee_photos_auth_upload" ON storage.objects;
CREATE POLICY "employee_photos_auth_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'employee-photos');

-- Allow authenticated users to update photos
DROP POLICY IF EXISTS "employee_photos_auth_update" ON storage.objects;
CREATE POLICY "employee_photos_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'employee-photos')
WITH CHECK (bucket_id = 'employee-photos');

-- Allow authenticated users to delete photos
DROP POLICY IF EXISTS "employee_photos_auth_delete" ON storage.objects;
CREATE POLICY "employee_photos_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'employee-photos');
