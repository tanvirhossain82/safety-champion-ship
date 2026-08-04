/*
# Add HR performance-sheet criteria breakdown

1. New columns
- `evaluations.hr_criteria` (jsonb, nullable): stores the individual HR positive and negative criterion scores used to calculate the HR score.

2. Modified tables
- `evaluations`: keeps the existing `hr_marks` and `negative_marks` totals for compatibility while adding the detailed HR breakdown.

3. Security
- No new table is exposed.
- Existing authenticated evaluation policies remain in place.

4. Important notes
- Positive HR criteria total a maximum of 25 marks: Attendance (5), Punctuality (5), Lunch Punch (5), Uniform (2), Rules & Regulation (5), and Leave Discipline (3).
- Negative HR criteria are stored as deductions: Unauthorized Leave (5), Lunch Punch Miss (1), Late Attendance (3), Leave Indiscipline (2), Uniform (2), Warning Letter (5), Show Cause (3), and Misconduct (10).
- Existing evaluation totals are preserved; older rows without a breakdown remain readable.
*/

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS hr_criteria jsonb;
