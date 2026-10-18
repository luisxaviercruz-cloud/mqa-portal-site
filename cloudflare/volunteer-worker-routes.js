/**
 * MQA+ Volunteer API — additive Cloudflare Worker route handler.
 * NOT deployed. Wire into the existing Worker after verifying auth, D1 binding and department policy.
 * Integration: if (url.pathname.startsWith('/volunteer-api/')) return handleVolunteerApi(request, env, { authenticate, canManageVolunteer });
 * authenticate(request,env) -> verified {id}; canManageVolunteer(actor,volunteerUserId,department,env) -> boolean; resolveVolunteerDepartment(actor,env) -> verified department string or null
 */
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fail=(message,status)=>json({error:message},status);
const categories=new Set(['event','office_admin','other']);
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const uuid=()=>crypto.randomUUID();
const readBody=async request=>{if(!request.headers.get('content-type')?.toLowerCase().includes('application/json'))throw Error('JSON required');const t=await request.text();if(t.length>12000)throw Error('Request too large');return JSON.parse(t)};
export async function handleVolunteerApi(request,env,{authenticate,canManageVolunteer,resolveVolunteerDepartment,listManagedVolunteerDepartments}={}){
 if(typeof authenticate!=='function'||typeof canManageVolunteer!=='function'||typeof resolveVolunteerDepartment!=='function'||!env?.DB)return fail('Volunteer API not configured',503);
 const actor=await authenticate(request,env);if(!actor?.id)return fail('Authentication required',401);
 const url=new URL(request.url),path=url.pathname,db=env.DB;
 try{
  // Management requires a verified department list supplied by the existing access system.
  // Never derive department privileges from query strings, request JSON, or client-side roles.
  if(path.startsWith('/volunteer-api/manage/')){
   if(typeof listManagedVolunteerDepartments!=='function')return fail('Management permissions not configured',503);
   const raw=await listManagedVolunteerDepartments(actor,env);
   const authorized=[...new Set((Array.isArray(raw)?raw:[]).filter(x=>typeof x==='string'&&x.trim()&&x.length<=120))];
   if(!authorized.length)return fail('Department management access required',403);
   if(path==='/volunteer-api/manage/departments'&&request.method==='GET')
    return json({departments:authorized.map(name=>({id:name,name}))});
   const requested=url.searchParams.get('department');
   if(requested&&!authorized.includes(requested))return fail('Department not authorized',403);
   if(path==='/volunteer-api/manage/assignments'&&request.method==='GET'){
    const departments=requested?[requested]:authorized;
    const rows=await db.prepare("SELECT a.*,u.first_name,u.last_name FROM mqa_volunteer_assignments a JOIN users u ON u.id=a.volunteer_user_id WHERE a.department IN ("+departments.map(()=>'?').join(',')+") ORDER BY a.created_at DESC LIMIT 300").bind(...departments).all();
    return json({assignments:rows.results||[]});
   }
   if(path==='/volunteer-api/manage/assignments'&&request.method==='POST'){
    const b=await readBody(request),department=String(b.department||''),volunteerId=String(b.volunteer_user_id||''),name=String(b.activity_name||'').trim(),description=String(b.description||'').trim();
    if(!authorized.includes(department))return fail('Department not authorized',403);
    if(!volunteerId||name.length<3||name.length>150||description.length>2000)return fail('Invalid assignment',400);
    if((b.starts_at&&!validDate(b.starts_at))||(b.ends_at&&!validDate(b.ends_at))||(b.starts_at&&b.ends_at&&b.ends_at<b.starts_at))return fail('Invalid assignment dates',400);
    // Authorization callback must verify the target user's active department eligibility.
    if(!await canManageVolunteer(actor,volunteerId,department,env))return fail('Volunteer or department not authorized',403);
    const exists=await db.prepare("SELECT id FROM users WHERE id=? AND status='active' AND email_verified=1").bind(volunteerId).first();
    if(!exists)return fail('Active verified user not found',404);
    const id=uuid();
    await db.batch([
     db.prepare("INSERT INTO mqa_volunteer_assignments(id,volunteer_user_id,department,activity_name,description,supervisor_user_id,starts_at,ends_at,status,created_by) VALUES(?,?,?,?,?,?,?,?, 'active',?)").bind(id,volunteerId,department,name,description,actor.id,b.starts_at||null,b.ends_at||null,actor.id),
     db.prepare("INSERT INTO mqa_volunteer_audit(id,actor_user_id,volunteer_user_id,assignment_id,action,details_json) VALUES(?,?,?,?,?,?)").bind(uuid(),actor.id,volunteerId,id,'assignment_created',JSON.stringify({department,activity_name:name}))
    ]);
    return json({id,status:'active'},201);
   }
   const assignmentMatch=path.match(/^\\/volunteer-api\\/manage\\/assignments\\/([^/]+)$/);
   if(assignmentMatch&&request.method==='PATCH'){
    const b=await readBody(request);
    if(!['completed','cancelled'].includes(b.status))return fail('Invalid assignment status',400);
    const row=await db.prepare('SELECT id,volunteer_user_id,department,status FROM mqa_volunteer_assignments WHERE id=?').bind(assignmentMatch[1]).first();
    if(!row)return fail('Assignment not found',404);
    if(!authorized.includes(row.department)||!await canManageVolunteer(actor,row.volunteer_user_id,row.department,env))return fail('Not authorized',403);
    if(row.status!=='active')return fail('Assignment already closed',409);
    const result=await db.batch([
     db.prepare("UPDATE mqa_volunteer_assignments SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'").bind(b.status,row.id),
     db.prepare("INSERT INTO mqa_volunteer_audit(id,actor_user_id,volunteer_user_id,assignment_id,action,details_json) SELECT ?,?,?,?,?,? WHERE changes()=1").bind(uuid(),actor.id,row.volunteer_user_id,row.id,'assignment_'+b.status,'{}')
    ]);
    if(result[0]?.meta?.changes!==1)return fail('Assignment already closed',409);
    return json({id:row.id,status:b.status});
   }
   if(path==='/volunteer-api/manage/report'&&request.method==='GET'){
    const from=url.searchParams.get('from'),to=url.searchParams.get('to');
    if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))return fail('Invalid reporting period',400);
    const departments=requested?[requested]:authorized;
    let sql="SELECT department,service_category,status,SUM(minutes_served) AS minutes,COUNT(*) AS entries FROM mqa_volunteer_service_hours WHERE department IN ("+departments.map(()=>'?').join(',')+") AND status='approved'";
    const args=[...departments];
    if(from){sql+=' AND service_date>=?';args.push(from)}
    if(to){sql+=' AND service_date<=?';args.push(to)}
    sql+=' GROUP BY department,service_category,status ORDER BY department,service_category';
    const rows=await db.prepare(sql).bind(...args).all();
    return json({report:rows.results||[]});
   }
   return fail('Management route not found',404);
  }
  if(path==='/volunteer-api/capabilities'&&request.method==='GET'){
   const dept=await resolveVolunteerDepartment(actor,env);
   const assigned=await db.prepare("SELECT 1 AS ok FROM mqa_volunteer_assignments WHERE volunteer_user_id=? AND status IN ('active','completed') LIMIT 1").bind(actor.id).first();
   return json({can_submit_hours:!!assigned||(typeof dept==='string'&&!!dept.trim()),can_review_hours:false});
  }
  if(path==='/volunteer-api/review-queue'&&request.method==='GET'){
   // Reviewers are never given an unfiltered queue. Each candidate is checked
   // against the existing portal's verified department authorization helper.
   if(typeof canManageVolunteer!=='function')return fail('Review access not configured',503);
   const rows=await db.prepare("SELECT h.id,h.volunteer_user_id,h.assignment_id,h.activity_name,h.service_category,h.service_date,h.minutes_served,h.notes,h.submitted_at,h.department FROM mqa_volunteer_service_hours h WHERE h.status='submitted' ORDER BY h.submitted_at ASC LIMIT 200").all();
   const allowed=[];
   for(const row of rows.results||[]){
    if(row.volunteer_user_id===actor.id||!row.department)continue;
    if(await canManageVolunteer(actor,row.volunteer_user_id,row.department,env))allowed.push(row);
   }
   return json({hours:allowed,scope:'verified_department',unrouted_excluded:true});
  }
  if(path==='/volunteer-api/me'&&request.method==='GET'){
   const [a,h]=await Promise.all([
    db.prepare('SELECT id,department,activity_name,description,starts_at,ends_at,status FROM mqa_volunteer_assignments WHERE volunteer_user_id=? ORDER BY starts_at DESC LIMIT 200').bind(actor.id).all(),
    db.prepare('SELECT id,assignment_id,activity_name,service_category,service_date,minutes_served,notes,status,submitted_at,review_note FROM mqa_volunteer_service_hours WHERE volunteer_user_id=? ORDER BY service_date DESC,submitted_at DESC LIMIT 500').bind(actor.id).all()
   ]);
   return json({assignments:a.results||[],hours:h.results||[]});
  }
  if(path==='/volunteer-api/hours'&&request.method==='POST'){
   const b=await readBody(request),name=String(b.activity_name||'').trim(),notes=String(b.notes||'').trim(),minutes=b.minutes_served;
   if(name.length<3||name.length>150||notes.length>2000||!categories.has(b.service_category)||!validDate(b.service_date)||!Number.isInteger(minutes)||minutes<1||minutes>1440)return fail('Invalid service hour details',400);
   const assignmentId=b.assignment_id||null;
   let department;
   if(assignmentId){const row=await db.prepare("SELECT id,department FROM mqa_volunteer_assignments WHERE id=? AND volunteer_user_id=? AND status IN ('active','completed')").bind(assignmentId,actor.id).first();if(!row)return fail('Assignment not available',403);department=row.department}
   else department=await resolveVolunteerDepartment(actor,env);
   if(typeof department!=='string'||!department.trim()||department.length>120)return fail('A verified volunteer department is required before submitting hours',403);
   const id=uuid(),audit=uuid();
   await db.batch([
    db.prepare("INSERT INTO mqa_volunteer_service_hours (id,volunteer_user_id,assignment_id,department,activity_name,service_category,service_date,minutes_served,notes,status) VALUES (?,?,?,?,?,?,?,?,?, 'submitted')").bind(id,actor.id,assignmentId,department,name,b.service_category,b.service_date,minutes,notes),
    db.prepare('INSERT INTO mqa_volunteer_audit (id,actor_user_id,volunteer_user_id,hours_id,action,details_json) VALUES (?,?,?,?,?,?)').bind(audit,actor.id,actor.id,id,'hours_submitted',JSON.stringify({service_category:b.service_category,minutes_served:minutes}))
   ]);
   return json({id,status:'submitted'},201);
  }
  const match=path.match(/^\/volunteer-api\/hours\/([^/]+)\/review$/);
  if(match&&request.method==='POST'){
   const b=await readBody(request),decision=b.decision,note=String(b.note||'').trim();
   if(!['approved','rejected'].includes(decision)||note.length>2000||(decision==='rejected'&&!note))return fail('Invalid review decision',400);
   const row=await db.prepare('SELECT h.id,h.volunteer_user_id,h.status,h.department FROM mqa_volunteer_service_hours h WHERE h.id=?').bind(match[1]).first();
   if(!row)return fail('Record not found',404);
   if(row.volunteer_user_id===actor.id)return fail('Self-review prohibited',403);
   if(!row.department)return fail('Department assignment required for review',403);
   if(!await canManageVolunteer(actor,row.volunteer_user_id,row.department,env))return fail('Not authorized',403);
   if(row.status!=='submitted')return fail('Already reviewed',409);
   // D1 batch executes statements in a transaction. changes() gates the audit insert
   // on this request's conditional update, preventing an audit event on a stale review.
   const results=await db.batch([
    db.prepare("UPDATE mqa_volunteer_service_hours SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='submitted'").bind(decision,actor.id,note,match[1]),
    db.prepare('INSERT INTO mqa_volunteer_audit (id,actor_user_id,volunteer_user_id,hours_id,action,details_json) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(uuid(),actor.id,row.volunteer_user_id,match[1],'hours_'+decision,JSON.stringify({note}))
   ]);
   if(results[0]?.meta?.changes!==1)return fail('Already reviewed',409);
   if(results[1]?.meta?.changes!==1)return fail('Review audit could not be confirmed',500);
   return json({id:match[1],status:decision});
  }
  return fail('Route not found',404);
 }catch(e){if(e instanceof SyntaxError)return fail('Invalid JSON',400);if(['JSON required','Request too large'].includes(e.message))return fail(e.message,400);return fail('Unable to process volunteer request',500)}
}
