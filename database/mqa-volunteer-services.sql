-- MQA+ Volunteer Services & Engagement | additive D1 schema v1
-- Apply after reviewing live D1 schema; no role assignments or sample records.
-- Backend MUST enforce authenticated user ownership, department scope, and coordinator approvals.
CREATE TABLE IF NOT EXISTS mqa_volunteer_assignments (
 id TEXT PRIMARY KEY,
 volunteer_user_id TEXT NOT NULL REFERENCES users(id),
 department TEXT NOT NULL DEFAULT 'Volunteer Services & Engagement',
 activity_name TEXT NOT NULL,
 description TEXT,
 supervisor_user_id TEXT REFERENCES users(id),
 starts_at TEXT,
 ends_at TEXT,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','active','completed','cancelled')),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mqa_vol_assign_user ON mqa_volunteer_assignments(volunteer_user_id,status);
CREATE TABLE IF NOT EXISTS mqa_volunteer_service_hours (
 id TEXT PRIMARY KEY,
 volunteer_user_id TEXT NOT NULL REFERENCES users(id),
 assignment_id TEXT REFERENCES mqa_volunteer_assignments(id),
 activity_name TEXT NOT NULL,
 service_category TEXT NOT NULL CHECK(service_category IN ('event','office_admin','other')),
 service_date TEXT NOT NULL,
 minutes_served INTEGER NOT NULL CHECK(minutes_served > 0 AND minutes_served <= 1440),
 notes TEXT,
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected','voided')),
 submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_by TEXT REFERENCES users(id),
 reviewed_at TEXT,
 review_note TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mqa_vol_hours_user_date ON mqa_volunteer_service_hours(volunteer_user_id,service_date);
CREATE INDEX IF NOT EXISTS idx_mqa_vol_hours_category ON mqa_volunteer_service_hours(volunteer_user_id,service_category,status);
CREATE INDEX IF NOT EXISTS idx_mqa_vol_hours_review ON mqa_volunteer_service_hours(status,submitted_at);
CREATE TABLE IF NOT EXISTS mqa_volunteer_audit (
 id TEXT PRIMARY KEY,
 actor_user_id TEXT NOT NULL REFERENCES users(id),
 volunteer_user_id TEXT NOT NULL REFERENCES users(id),
 assignment_id TEXT REFERENCES mqa_volunteer_assignments(id),
 hours_id TEXT REFERENCES mqa_volunteer_service_hours(id),
 action TEXT NOT NULL,
 details_json TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mqa_vol_audit_volunteer ON mqa_volunteer_audit(volunteer_user_id,created_at);
-- Backend implementation requirements:
-- GET /volunteer-api/me returns only authenticated user's assignments/hours.
-- POST /volunteer-api/hours derives volunteer_user_id from verified session, not request body.
-- Require service_category = event, office_admin, or other. Never infer from activity text.
-- Reject overlapping duplicate submissions for same volunteer/assignment/date/time where applicable.
-- GET /volunteer-api/me includes service_category per record for accurate thermometer totals.
-- POST /volunteer-api/hours/:id/review requires authorized coordinator/director;
-- reject self-approval and enforce department scope; record all decisions in audit.
-- Approval must use atomic status transition submitted -> approved/rejected.
-- Approved totals are SUM(minutes_served) WHERE status='approved'; no payroll linkage.
-- Do not deploy frontend submission until Worker routes and D1 migration are live.
