-- MQA+ Board Member at Large — Professional Expertise | additive D1 migration
-- Review with authorized administrator; back up D1 before applying.
-- Requires database/mqa-user-access-management.sql to have been applied.
-- This migration does NOT appoint board members, grant permissions, or verify licenses.
INSERT OR IGNORE INTO mqa_access_positions
 (id,code,title,category,is_founder_designation,active)
VALUES
 ('mqa-pos-board-member-at-large','board_member_at_large','Board Member at Large','board',0,1);

-- Separate professional service/credential review from board governance.
-- Do not store confidential client records, identification numbers, or license scans here.
CREATE TABLE IF NOT EXISTS mqa_board_professional_reviews (
 id TEXT PRIMARY KEY,
 access_request_id TEXT NOT NULL UNIQUE REFERENCES mqa_access_requests(id),
 specialty TEXT NOT NULL,
 experience_summary TEXT,
 credential_summary TEXT,
 proposed_services TEXT,
 monthly_hours INTEGER CHECK(monthly_hours IS NULL OR (monthly_hours BETWEEN 0 AND 200)),
 conflict_disclosure TEXT,
 credential_status TEXT NOT NULL DEFAULT 'pending'
   CHECK(credential_status IN ('pending','verified','not_applicable','rejected')),
 credential_reviewed_by TEXT REFERENCES users(id),
 credential_reviewed_at TEXT,
 bylaws_review_status TEXT NOT NULL DEFAULT 'pending'
   CHECK(bylaws_review_status IN ('pending','confirmed','needs_revision')),
 service_agreement_status TEXT NOT NULL DEFAULT 'not_started'
   CHECK(service_agreement_status IN ('not_started','pending','signed','not_required')),
 board_appointment_status TEXT NOT NULL DEFAULT 'not_appointed'
   CHECK(board_appointment_status IN ('not_appointed','pending','appointed','declined')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mqa_board_professional_review_status
 ON mqa_board_professional_reviews(credential_status,board_appointment_status);

-- Verification after execution:
-- SELECT id,code,title,category,active FROM mqa_access_positions
-- WHERE code='board_member_at_large';
-- SELECT name FROM sqlite_master WHERE type='table'
-- AND name='mqa_board_professional_reviews';
--
-- Security requirements for future Worker endpoints:
-- Authenticate and authorize every read/write; only CEO/COO or explicitly
-- delegated reviewers can update credential review status, subject to policy.
-- Enforce separation of duties and log each review/appointment decision in
-- mqa_access_audit. A verified credential does not grant board membership.
-- No self-approval, no automatic role assignment, and no unreviewed
-- professional services to community members.
