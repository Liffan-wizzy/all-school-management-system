import { json, parseJson, requireRole, randomId } from '../_lib/auth.js';
import { writeAudit } from '../_lib/workflows.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireRole(request, env, ['PLATFORM_ADMIN','SCHOOL_ADMIN','SECRETARY','TEACHER']);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const schoolId = auth.user.role === 'PLATFORM_ADMIN' ? String(url.searchParams.get('school_id') || '') : String(auth.user.school_id);
  if (!schoolId) return json({ error: 'school_id is required for platform-admin views.' }, 400);
  let sql = 'SELECT id, school_id, name, code, class_name, created_at FROM auth_subjects WHERE CAST(school_id AS TEXT) = ?';
  const params = [schoolId];
  if (auth.user.role === 'TEACHER') { sql += ' AND EXISTS (SELECT 1 FROM auth_teacher_assignments a WHERE a.subject_id = auth_subjects.id AND a.teacher_user_id = ? AND CAST(a.school_id AS TEXT) = ?)'; params.push(auth.user.id, schoolId); }
  sql += ' ORDER BY class_name, name';
  const rows = await env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, subjects: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireRole(request, env, ['SCHOOL_ADMIN','SECRETARY']);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const name = String(body?.name || '').trim().slice(0,100);
  const code = String(body?.code || '').trim().slice(0,40);
  const className = String(body?.class_name || '').trim().slice(0,80);
  if (!name || !className) return json({ error: 'Subject name and class_name are required.' }, 400);
  const id = randomId();
  try {
    await env.DB.prepare('INSERT INTO auth_subjects (id, school_id, name, code, class_name, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, String(auth.user.school_id), name, code, className, auth.user.id).run();
    await writeAudit(env.DB, auth.user, auth.user.school_id, 'SUBJECT_CREATE', 'subject', id, { name, class_name: className });
    return json({ ok: true, id, message: 'Subject created.' }, 201);
  } catch (e) {
    console.error('Subject create failed:', e);
    return json({ error: 'Could not create subject. A subject with this name may already exist for that class.' }, 409);
  }
}
