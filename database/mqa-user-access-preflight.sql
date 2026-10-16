-- MQA+ D1 preflight: run BEFORE database/mqa-user-access-management.sql
-- Each of the first three checks must return one row with present=1.
SELECT 'users' AS required_table, COUNT(*) AS present FROM sqlite_master WHERE type='table' AND name='users'
UNION ALL SELECT 'roles', COUNT(*) FROM sqlite_master WHERE type='table' AND name='roles'
UNION ALL SELECT 'user_roles', COUNT(*) FROM sqlite_master WHERE type='table' AND name='user_roles';
-- Confirm actual key columns in your live D1 instance:
PRAGMA table_info(users);
PRAGMA table_info(roles);
PRAGMA table_info(user_roles);
-- Confirm existing database foreign-key integrity before migration:
PRAGMA foreign_key_check;
-- After migration, run:
-- SELECT code,title,category FROM mqa_access_positions ORDER BY category,title;
-- SELECT COUNT(*) AS assignment_count FROM mqa_access_assignments;
-- SELECT COUNT(*) AS invitation_count FROM mqa_access_invitations;
-- SELECT COUNT(*) AS audit_count FROM mqa_access_audit;
