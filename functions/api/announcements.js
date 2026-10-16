import { json, parseJson, requireRole, randomId } from '../_lib/auth.js';
import { writeAudit } from '../_lib/workflows.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireRole(request, env, ['PLATFORM_ADMIN','SCHOOL_ADMIN','SECRETARY','TEACHER','PARENT']);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const schoolId = auth.user.role === 'PLATFORM_ADMIN' ? String(url.searchParams.get('school_id') || '') : String(auth.user.school_id);
  if (!schoolId) return json({ error: 'school_id is required.' }, 400);
  let sql = 'SELECT a.id, a.school_id, a.title, a.body, a.audience, a.created_at, u.full_name AS author FROM auth_announcements a LEFT JOIN auth_users u ON u.id = a.created_by WHERE CAST(a.school_id AS TEXT) = ?';
  const params = [schoolId];
  if (auth.user.role === 'PARENT') sql += " AND a.audience IN ('ALL','PARENTS')";
  if (auth.user.role === 'TEACHER') sql += " AND a.audience IN ('ALL','TEACHERS')";
  sql += ' ORDER BY a.created_at DESC LIMIT 200';
  const rows = await env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, announcements: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireRole(request, env, ['SCHOOL_ADMIN','SECRETARY']);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const title = String(body?.title || '').trim().slice(0,160);
  const text = String(body?.body || '').trim().slice(0,5000);
  const audience = String(body?.audience || 'ALL').toUpperCase();
  if (!title || !text || !['ALL','PARENTS','TEACHERS','STAFF'].includes(audience)) return json({ error: 'Provide title, body and audience ALL, PARENTS, TEACHERS or STAFF.' }, 400);
  const id = randomId();
  await env.DB.prepare('INSERT INTO auth_announcements (id, school_id, title, body, audience, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, String(auth.user.school_id), title, text, audience, auth.user.id).run();
  await writeAudit(env.DB, auth.user, auth.user.school_id, 'ANNOUNCEMENT_CREATE', 'announcement', id, { title, audience });
  return json({ ok: true, id }, 201);
}
