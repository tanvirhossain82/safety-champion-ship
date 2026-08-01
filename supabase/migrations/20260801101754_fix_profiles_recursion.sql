-- Fix infinite recursion in profiles SELECT policy
-- The old policy queried profiles from within a profiles policy, causing recursion.
-- Use a SECURITY DEFINER function to break the cycle.

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'admin');
$$;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.is_admin(auth.uid()));
