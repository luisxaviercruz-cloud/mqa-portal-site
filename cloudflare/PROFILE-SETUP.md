# Profile backend deployment — Cloudflare D1 only

The member_profiles table was created successfully in mqa-portal-db.

## Step 1 — database
Run **only** the SQL from [profile-photo-migration.sql](profile-photo-migration.sql) in Cloudflare D1 Console. Run once. Do not paste JavaScript or Markdown into D1 Console.

## Step 2 — Worker
Back up the live mqa-portal Worker. Insert the route branches from [profile-worker-routes.js](profile-worker-routes.js) **inside the existing fetch handler**, after URL initialization and before the 404/fallthrough. This is a code fragment, not a complete Worker. Check the existing authentication and CORS helper names and adapt them before deployment. Add PATCH, PUT and DELETE to allowed CORS methods, and ensure the portal origin is permitted.

## Step 3 — verify
With an authenticated portal session, test GET/PATCH /profile, GET/PUT/DELETE /profile/photo. Confirm that unauthenticated requests return 401 and that users cannot read other users' photos.

## Step 4 — portal UI
Only after the Worker endpoints have been deployed and tested, update profile.html to sync photo, preferred name and phone with the API. Until then, profile.html continues saving only to the browser.

## Design notes
- D1 stores a single base64 data URL per member in photo_data; replacing overwrites the previous photo.
- Maximum photo payload is **100 KB decoded**. Resize/compress on the client before uploading.
- D1 has storage/query limits; this approach is intended for modest membership and small photos. Monitor usage.
- Keep profile data authenticated and private. Never store member photos in the public GitHub repo.
- No R2 subscription or bucket is required.
