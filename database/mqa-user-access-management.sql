-- MQA+ User & Access Management | D1 migration v1
-- BACK UP THE D1 DATABASE BEFORE EXECUTION. This script does not grant roles.
-- Existing portal tables: users(id), roles(id,name), user_roles(user_id,role_id).
CREATE TABLE IF NOT EXISTS mqa_access_positions (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('executive','board','system','department','staff','volunteer','ambassador')),
 is_founder_designation INTEGER NOT NULL DEFAULT 0 CHECK(is_founder_designation IN (0,1)),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mqa_access_assignments (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 position_id TEXT NOT NULL REFERENCES mqa_access_positions(id),
 department_id TEXT,
 is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended','ended')),
 starts_at TEXT, ends_at TEXT,
 approved_by TEXT REFERENCES users(id), approved_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mqa_access_assignment ON mqa_access_assignments(user_id,position_id,ifnull(department_id,'')) WHERE status='active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_mqa_founder_ceo ON mqa_access_assignments(position_id) WHERE status='active' AND position_id='mqa-pos-founder-ceo';
CREATE UNIQUE INDEX IF NOT EXISTS uq_mqa_cofounder_coo ON mqa_access_assignments(position_id) WHERE status='active' AND position_id='mqa-pos-cofounder-coo';
CREATE TABLE IF NOT EXISTS mqa_access_invitations (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL, user_id TEXT REFERENCES users(id),
 token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
 accepted_at TEXT, revoked_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mqa_invite_email ON mqa_access_invitations(email);
CREATE TABLE IF NOT EXISTS mqa_access_requests (
 id TEXT PRIMARY KEY,
 subject_user_id TEXT REFERENCES users(id),
 requested_by TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL CHECK(action IN ('invite','assign','change','remove','suspend','reactivate')),
 requested_changes_json TEXT NOT NULL, reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, review_note TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mqa_access_audit (
 id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES users(id),
 subject_user_id TEXT REFERENCES users(id),
 action TEXT NOT NULL, details_json TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO mqa_access_positions(id,code,title,category,is_founder_designation) VALUES
 ('mqa-pos-founder-ceo','founder_ceo','Founder, Executive & CEO','executive',1),
 ('mqa-pos-cofounder-coo','cofounder_coo','Co-Founder & COO','executive',1),
 ('mqa-pos-admin','administrator','Administrator','system',0),
 ('mqa-pos-board-chair','board_chair','Board Chair','board',0),
 ('mqa-pos-board-vice-chair','board_vice_chair','Board Vice Chair','board',0),
 ('mqa-pos-board-secretary','board_secretary','Board Secretary','board',0),
 ('mqa-pos-board-treasurer','board_treasurer','Board Treasurer','board',0),
 ('mqa-pos-board-member','board_member','Board Member','board',0),
 ('mqa-pos-director','department_director','Department Director','department',0),
 ('mqa-pos-coordinator','coordinator','Coordinator','department',0),
 ('mqa-pos-staff','staff','Staff','staff',0),
 ('mqa-pos-volunteer','volunteer','Volunteer','volunteer',0),
 ('mqa-pos-ambassador','ambassador','Ambassador','ambassador',0);
-- IMPORTANT: UI is not an authorization boundary. Worker must enforce:
-- CEO/COO-only executive approvals, invite token hashing and expiration,
-- no founder self-assignment, department-scoped permissions, and audit logging.
