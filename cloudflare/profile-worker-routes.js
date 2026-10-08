// My MQA+ profile endpoints for Cloudflare D1 (NO R2).
// Insert these route branches into the existing Worker's fetch(request, env) AFTER
// const url = new URL(request.url); and BEFORE the final 404/fallthrough.
// Integration assumptions: getSessionUser(request, env) returns {user_id}, and
// json(request, payload, status?) and corsHeaders(request) exist in your Worker.
// Review those helper names against your LIVE Worker before deploying.
// Run profile-photo-migration.sql in D1 first.
// IMPORTANT: Only allow your trusted portal origin in corsHeaders; never use '*' for authenticated endpoints.
if (url.pathname === "/profile" && ["GET", "PATCH"].includes(request.method)) {
  const user = await getSessionUser(request, env);
  if (!user?.user_id) return json(request, { ok:false, error:"Sign in required" }, 401);
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT preferred_name, phone, photo_data FROM member_profiles WHERE user_id=?")
      .bind(user.user_id).first();
    return json(request, {ok:true, profile:{
      preferred_name:row?.preferred_name || "",
      phone:row?.phone || "",
      has_photo:!!row?.photo_data
    }});
  }
  let data;
  try { data=await request.json(); } catch { return json(request,{ok:false,error:"Invalid JSON"},400); }
  const name=data?.preferred_name, phone=data?.phone;
  if (typeof name!=="string" || name.length>80 || typeof phone!=="string" || phone.length>30)
    return json(request,{ok:false,error:"Invalid profile fields"},400);
  await env.DB.prepare(`INSERT INTO member_profiles(user_id,preferred_name,phone,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET
    preferred_name=excluded.preferred_name,phone=excluded.phone,updated_at=CURRENT_TIMESTAMP`)
    .bind(user.user_id,name.trim(),phone.trim()).run();
  return json(request,{ok:true});
}
if (url.pathname === "/profile/photo" && ["GET","PUT","DELETE"].includes(request.method)) {
  const user=await getSessionUser(request,env);
  if (!user?.user_id) return json(request,{ok:false,error:"Sign in required"},401);
  if (request.method==="GET") {
    const row=await env.DB.prepare("SELECT photo_data FROM member_profiles WHERE user_id=?")
      .bind(user.user_id).first();
    if (!row?.photo_data) return json(request,{ok:false,error:"No profile photo"},404);
    return json(request,{ok:true,photo:row.photo_data});
  }
  if (request.method==="DELETE") {
    await env.DB.prepare("UPDATE member_profiles SET photo_data=NULL,updated_at=CURRENT_TIMESTAMP WHERE user_id=?")
      .bind(user.user_id).run();
    return json(request,{ok:true});
  }
  // Only compressed small images; clients should resize before upload.
  const length=Number(request.headers.get("Content-Length")||0);
  if (length>140000) return json(request,{ok:false,error:"Photo exceeds 100 KB limit"},413);
  let data;
  try { data=await request.json(); } catch { return json(request,{ok:false,error:"Invalid JSON"},400); }
  const photo=data?.photo;
  if (typeof photo!=="string" || photo.length>140000)
    return json(request,{ok:false,error:"Photo exceeds 100 KB limit"},413);
  const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
  if (!match) return json(request,{ok:false,error:"Invalid image format"},415);
  const binary=atob(match[2]);
  if (!binary.length || binary.length>100000) return json(request,{ok:false,error:"Photo exceeds 100 KB limit"},413);
  const jpg=binary.charCodeAt(0)===255&&binary.charCodeAt(1)===216&&binary.charCodeAt(2)===255;
  const png=binary.slice(0,8)==="\x89PNG\r\n\x1a\n";
  const webp=binary.slice(0,4)==="RIFF"&&binary.slice(8,12)==="WEBP";
  if (!(match[1]==="image/jpeg"&&jpg||match[1]==="image/png"&&png||match[1]==="image/webp"&&webp))
    return json(request,{ok:false,error:"Image content does not match format"},415);
  await env.DB.prepare(`INSERT INTO member_profiles(user_id,photo_data,updated_at)
    VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET
    photo_data=excluded.photo_data,updated_at=CURRENT_TIMESTAMP`)
    .bind(user.user_id,photo).run();
  return json(request,{ok:true});
}
