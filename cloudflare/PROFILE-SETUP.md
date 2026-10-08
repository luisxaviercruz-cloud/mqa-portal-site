# Profile backend deployment (manual, not yet live)
1. In Cloudflare D1 database mqa-portal-db, run profile-migration.sql in Console.
2. Create a **private** Cloudflare R2 bucket, e.g. mqa-profile-photos. Do not enable public access.
3. In Worker mqa-portal > Settings > Bindings, add an R2 bucket binding named exactly PROFILE_PHOTOS pointing to the bucket.
4. Back up the existing Worker source. Insert the branches from profile-worker-routes.js inside fetch(request, env) after the URL is initialized, BEFORE other route fallthrough. Do not replace the existing Worker with this fragment.
5. Extend Access-Control-Allow-Methods in corsHeaders to "GET, POST, PATCH, PUT, DELETE, OPTIONS".
6. Deploy and test with an authenticated account before enabling the portal's remote sync UI.
Note: The pasted Worker includes a duplicated escapeHtml() declaration; check the live editor version before deploying anything. The pasted Markdown is escaped and must not be deployed verbatim.
