-- MQA+ Volunteer Services read-only D1 preflight
-- Run in Cloudflare D1 Console on mqa-portal-db. Does NOT change data.
SELECT name,type FROM sqlite_master WHERE type IN ('table','view') AND name IN ('users','roles','user_roles','mqa_departments','mqa_user_departments','mqa_access_positions','mqa_access_assignments','mqa_volunteer_assignments','mqa_volunteer_service_hours','mqa_volunteer_audit') ORDER BY name;
SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN ('mqa_departments','mqa_user_departments','mqa_access_positions','mqa_access_assignments','mqa_volunteer_assignments','mqa_volunteer_service_hours','mqa_volunteer_audit') ORDER BY name;
SELECT name,tbl_name,sql FROM sqlite_master WHERE type='index' AND tbl_name IN ('mqa_volunteer_assignments','mqa_volunteer_service_hours','mqa_volunteer_audit') ORDER BY tbl_name,name;
PRAGMA foreign_key_check;
