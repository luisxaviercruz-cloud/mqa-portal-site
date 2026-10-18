# MQA+ Volunteer Services — Worker integration contract

Status: **implementation specification, not a deployed API**. Existing Cloudflare Worker code must remain intact. Add routes only after inspecting the current authentication and role helpers. Do not launch submission/review buttons until routes and D1 tables are live.

## Identity and authorization
- Verify the existing portal Bearer session using the Worker's existing auth mechanism; derive user ID server-side. Never accept volunteer_user_id, actor_user_id, reviewer ID, or role from the client.
- GET /volunteer-api/me: return only the authenticated person's records, including category, status and minutes. Return `{assignments:[],hours:[]}` for a verified account with no records. No fabricated sample entries.
- Coordinator/director review is limited to volunteers assigned to their authorized department, using verified department-role assignments; CEO/COO administrative override only if existing access policy explicitly permits it. Do not infer scope from a free-text title.
- Volunteers cannot approve their own hours. An approver cannot approve hours submitted under their own user ID even if they have multiple roles.
- All write endpoints must validate JSON shape, length, dates, categories, numeric ranges, assignment ownership, and CSRF/origin policy consistent with existing Worker. Log audit records. Never disclose other users' private records to volunteers.

## Service-hour submission
`POST /volunteer-api/hours` JSON:
```json
{"activity_name":"Community event setup","service_category":"event","service_date":"2026-10-17","minutes_served":120,"assignment_id":null,"notes":""}
```
Allowed `service_category`: `event`, `office_admin`, `other`. The user chooses the category; the server validates it and stores it unchanged. No automatic categorization by activity name. Initial status is always `submitted`. Ignore or reject client-supplied status. Verify referenced assignment belongs to the submitting volunteer. Return generated record ID and pending status; audit the submission. Use a transaction/batch for the record and audit event.

## Coordinator/director review
`GET /volunteer-api/review-queue`: verified authorized reviewer; return only pending records within their department scope, with volunteer display names needed for review.

`POST /volunteer-api/hours/:id/review` JSON: `{"decision":"approved","note":"Verified with event lead"}` or `{"decision":"rejected","note":"Please correct the date"}`. Validate reviewer scope and prohibit self-review. Atomic conditional update `WHERE status='submitted'`; reject repeat/competing decisions with conflict response. Store reviewer ID/time/note and append audit record atomically. Approved hours alone contribute to totals. Rejected and voided hours never count.

## Assignment management
`POST /volunteer-api/assignments`: authorized director/coordinator within department scope; validate volunteer is assigned/eligible in the relevant department; store assignment and audit.
`PATCH /volunteer-api/assignments/:id`: same authorized department scope; allow only valid status transitions and audit changes. No assignment auto-approval or impersonation.

## Dashboard response and accounting
`GET /volunteer-api/me` response shape:
```json
{"assignments":[],"hours":[]}
```
Each hours record includes `id`, `activity_name`, `service_category`, `service_date`, `minutes_served`, `status`, `notes`. Only `approved` records are summed into Event, Office & Administrative, Other, and Total. Total is sum of all approved minutes, including Other. Pending is reported separately, never included in approved totals. No payroll linkage.

## Deployment order
1. Review current D1 table definitions and Worker authentication/access helpers.
2. Apply `database/mqa-volunteer-services.sql` once, after schema compatibility check. **Do not reapply as-is if hours table already exists without service_category**; use a reviewed additive ALTER TABLE migration instead.
3. Implement and deploy additive Worker routes, including server-side access checks and audit transactions.
4. Test with nonproduction accounts and verify self-review denial, cross-department denial, race-safe approval, duplicate handling and accurate totals.
5. Enable volunteer submission and reviewer controls only after verified deployment.
6. Perform full onboarding/approval/invitation end-to-end testing at the end of portal development, as planned.

## October 2026 combined implementation progress
- Personal recording and history page: `volunteer-hours.html`; approved totals and assignments: `volunteer-dashboard.html`.
- Separate reviewer UI: `volunteer-hours-review.html`. It only displays server-returned review records; it is not linked to general volunteer navigation.
- Prepared `GET /volunteer-api/review-queue` filters assignment-linked submissions through the server's verified `canManageVolunteer` authorization callback and excludes self-review. It does **not** expose all submitted records.
- **Critical unresolved routing issue:** personal hour submissions currently permit `assignment_id: null`, but the review queue and review action require a department from an assignment. These submissions cannot be approved until a verified server-side department routing policy is added (e.g. a trusted reviewer department resolver and schema migration). Never accept a user-supplied department as authoritative. Do not activate production submissions until this is resolved.
- **Deployment blockers:** inspect the live Worker source, D1 `users` table and actual department authorization helper; execute the reviewed migration; integrate the additive route handler; deploy and verify API capabilities. GitHub commits alone do not activate any of these features.
- Full onboarding/invitation end-to-end testing remains deferred as agreed.
