// My MQA+ profile endpoints: add these branches inside the existing Worker fetch(request, env)
// AFTER: const url = new URL(request.url);
// Requires D1 binding DB, R2 binding PROFILE_PHOTOS, and migration in profile-migration.sql.
// Keep the bucket PRIVATE; never use public R2 URLs.
if (url.pathname === "/profile" && ["GET","PATCH"].includes(request.method)) {
  const user = await getSessionUser(request, env);
  if (!user) return json(request, {ok:false,error:"Sign in required"}, 401);
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT preferred_name,phone,photo_key FROM member_profiles WHERE user_id=?").bind(user.user_id).first();
    return json(request, {ok:true,profile:{preferred_name:row?.preferred_name||"",phone:row?.phone||"",has_photo:!!row?.photo_key}});
  }
  let data;
  try { data = await request.json(); } catch { return json(request,{ok:false,error:"Invalid JSON"},400); }
  const name = data.preferred_name, phone = data.phone;
  if (typeof name !== "string" || name.length > 80 || typeof phone !== "string" || phone.length > 30)
    return json(request,{ok:false,error:"Invalid profile fields"},400);
  await env.DB.prepare(`INSERT INTO member_profiles(user_id,preferred_name,phone,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET
    preferred_name=excluded.preferred_name,phone=excluded.phone,updated_at=CURRENT_TIMESTAMP`)
    .bind(user.user_id,name.trim(),phone.trim()).run();
  return json(request,{ok:true});
}
if (url.pathname === "/profile/photo" && ["GET","PUT","DELETE"].includes(request.method)) {
  const user = await getSessionUser(request,env);
  if (!user) return json(request,{ok:false,error:"Sign in required"},401);
  if (!env.PROFILE_PHOTOS) return json(request,{ok:false,error:"Photo storage is not configured"},503);
  const row = await env.DB.prepare("SELECT photo_key FROM member_profiles WHERE user_id=?").bind(user.user_id).first();
  if (request.method === "GET") {
    if (!row?.photo_key) return new Response(null,{status:404,headers:corsHeaders(request)});
    const object = await env.PROFILE_PHOTOS.get(row.photo_key);
    if (!object) return new Response(null,{status:404,headers:corsHeaders(request)});
    return new Response(object.body,{headers:{...corsHeaders(request),"Content-Type":object.httpMetadata?.contentType||"image/jpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }
  if (request.method === "DELETE") {
    if (row?.photo_key) await env.PROFILE_PHOTOS.delete(row.photo_key);
    await env.DB.prepare("UPDATE member_profiles SET photo_key=NULL,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(user.user_id).run();
    return json(request,{ok:true});
  }
  const type=request.headers.get("Content-Type")||"";
  const valid=["image/jpeg","image/png","image/webp"];
  if (!valid.includes(type)) return json(request,{ok:false,error:"Use JPG, PNG or WebP"},415);
  if (Number(request.headers.get("Content-Length")||0)>1048576) return json(request,{ok:false,error:"Maximum 1 MB"},413);
  const bytes=await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength>1048576) return json(request,{ok:false,error:"Maximum 1 MB"},413);
  const header=new Uint8Array(bytes.slice(0,12));
  const jpg=header[0]===255&&header[1]===216&&header[2]===255;
  const png=[137,80,78,71,13,10,26,10].every((v,i)=>header[i]===v);
  const webp=String.fromCharCode(...header.slice(0,4))==="RIFF"&&String.fromCharCode(...header.slice(8,12))==="WEBP";
  if (!(type==="image/jpeg"&&jpg||type==="image/png"&&png||type==="image/webp"&&webp))
    return json(request,{ok:false,error:"File is not a valid image"},415);
  const key="profile/"+user.user_id+"/"+crypto.randomUUID();
  await env.PROFILE_PHOTOS.put(key,bytes,{httpMetadata:{contentType:type}});
  try {
    await env.DB.prepare(`INSERT INTO member_profiles(user_id,photo_key,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET photo_key=excluded.photo_key,updated_at=CURRENT_TIMESTAMP`)
      .bind(user.user_id,key).run();
  } catch(e) { await env.PROFILE_PHOTOS.delete(key); throw e; }
  if (row?.photo_key) await env.PROFILE_PHOTOS.delete(row.photo_key);
  return json(request,{ok:true});
}
