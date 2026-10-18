-- OPTIONAL migration ONLY if mqa_volunteer_service_hours already exists without department.
-- Inspect PRAGMA table_info(mqa_volunteer_service_hours) before applying.
-- Do not run on a new database using the updated base schema (department already exists).
ALTER TABLE mqa_volunteer_service_hours ADD COLUMN department TEXT;
UPDATE mqa_volunteer_service_hours
SET department=(SELECT a.department FROM mqa_volunteer_assignments a WHERE a.id=mqa_volunteer_service_hours.assignment_id)
WHERE department IS NULL AND assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mqa_vol_hours_department_review
ON mqa_volunteer_service_hours(department,status,submitted_at);
-- Pre-existing unassigned rows with NULL department require manual verified routing.
-- The Worker rejects review of rows without a trusted department; do not guess.
