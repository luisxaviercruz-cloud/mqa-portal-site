# MQA+ Forms & Applications / Document Control — implementation contract

Status: foundation only; **not production enabled**. Existing portal uses static HTML with a Cloudflare Worker API at `https://mqa-portal.luisxaviercruz.workers.dev`. The Worker source and database schema were not found in this repository. Never enforce authorization only in browser JavaScript.

## Approved requirements
- Roles that can grant/revoke access: CEO/Executive Director, COO, System Administrator. Server must check authenticated identities and explicit permissions, not role labels alone.
- Applicants can only see forms explicitly granted to them; submissions are immutable snapshots. Any correction creates a new revision or separate addendum.
- Office Use Only fields can only be completed by authorized reviewers; review decisions are separate records with identity, timestamp, reason, and audit event.
- Finger/mouse signature pad with affirmative signing consent, date/time, and immutable signature evidence; calendar/date picker and accessible checkbox controls.
- Server-generated official PDFs; preserve approved MQA+ design.
- Never store sensitive application data or signature images in public GitHub files, localStorage, or client-side-only databases.

## Document ID policy
- Parent agreement: `MQA-200-AGR-A` (family letter permanent, never reused).
- Related document: `MQA-200-FRM-A0002` (globally unique 4-digit sequence across all related-document categories/families).
- Standalone: `MQA-600-FRM-0007` (globally unique numeric sequence, not restarted by category).
- IDs allocated transactionally in the database, immutable, never recycled; canceled drafts remain reserved.
- Version, effective date, review date, revision date, approval status, and document category are separate fields.
- The first Ambassador Application's final ID must be looked up in the authoritative register before allocation; do not guess it from examples.

## Proposed server tables
`document_families(id, letter UNIQUE, parent_document_id UNIQUE)`
`document_registry(id, document_id UNIQUE, family_id NULL, category, type, title, version, status, effective_at, reviewed_at, revised_at, created_by, created_at)`
`document_sequences(name PRIMARY KEY, next_value)`
`form_templates(id, document_registry_id, schema_json, version, published_at)`
`form_grants(id, form_template_id, user_id, permission, granted_by, revoked_at)`
`form_submissions(id, form_template_id, applicant_id, answers_snapshot_json, signed_at, signature_evidence_ref, submitted_at, content_hash)`
`form_reviews(id, submission_id, reviewer_id, decision, office_fields_json, reviewed_at)`
`audit_events(id, actor_id, action, object_type, object_id, timestamp, metadata_json)`

## Required Worker API (not yet implemented)
- GET /forms/catalog — only granted forms
- GET /forms/:id — access checked
- POST /forms/:id/submissions — validates, stores immutable snapshot and signing evidence
- GET /forms/submissions/:id — applicant owner or explicitly permitted reviewer
- POST /forms/submissions/:id/reviews — reviewer permission, append-only
- GET /documents/registry — permission filtered
- POST /documents/registry — authorized only, transactional ID allocator
- POST /forms/grants — CEO/COO/admin only; audit logged

## Release gate
Do not make the UI available to members until Worker endpoints, authorization, persistence, tests, and PDF generation are implemented and reviewed. UI alone does not secure applicant information.
