import { json, parseJson, requireRole, randomId } from '../_lib/auth.js';
import { writeAudit } from '../_lib/workflows.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireRole(request, env, ['PLATFORM_ADMIN','SCHOOL_ADMIN','TEACHER']);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const schoolId = auth.user.role === 'PLATFORM_ADMIN' ? String(url.searchParams.get('school_id') || '') : String(auth.user.school_id);
  if (!schoolId) return json({ error: 'school_id is required.' }, 400);
  let sql = `SELECT a.id, a.school_id, a.teacher_user_id, u.full_name AS teacher_name, a.subject_id,
    s.name AS subject_name, a.class_name, a.can_mark, a.can_attend, a.created_at
    FROM auth_teacher_assignments a JOIN auth_users u ON u.id = a.teacher_user_id
    JOIN auth_subjects s ON s.id = a.subject_id WHERE CAST(a.school_id AS TEXT) = ?`;
  const params = [schoolId];
  if (auth.user.role === 'TEACHER') { sql += ' AND a.teacher_user_id = ?'; params.push(auth.user.id); }
  sql += ' ORDER BY a.class_name, s.name, u.full_name';
  const rows = await env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, assignments: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireRole(request, env, ['SCHOOL_ADMIN']);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const teacherId = String(body?.teacher_user_id || '');
  const subjectId = String(body?.subject_id || '');
  const className = String(body?.class_name || '').trim().slice(0,80);
  const canMark = body?.can_mark === false ? 0 : 1;
  const canAttend = body?.can_attend === false ? 0 : 1;
  if (!teacherId || !subjectId || !className) return json({ error: 'teacher_user_id, subject_id and class_name are required.' }, 400);
  const teacher = await env.DB.prepare(`SELECT id FROM auth_users WHERE id = ? AND role = 'TEACHER' AND active = 1 AND CAST(school_id AS TEXT) = ? LIMIT 1`).bind(teacherId, String(auth.user.school_id)).first();
  const subject = await env.DB.prepare('SELECT id, class_name FROM auth_subjects WHERE id = ? AND CAST(school_id AS TEXT) = ? LIMIT 1').bind(subjectId, String(auth.user.school_id)).first();
  if (!teacher || !subject || String(subject.class_name) !== className) return json({ error: 'Teacher and subject must belong to your school, and the assignment class must match the subject class.' }, 400);
  const id = randomId();
  try {
    await env.DB.prepare(`INSERT INTO auth_teacher_assignments
      (id, school_id, teacher_user_id, subject_id, class_name, can_mark, can_attend, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, String(auth.user.school_id), teacherId, subjectId, className, canMark, canAttend, auth.user.id).run();
    await writeAudit(env.DB, auth.user, auth.user.school_id, 'TEACHER_ASSIGN', 'teacher_assignment', id, { teacher_user_id: teacherId, subject_id: subjectId, class_name: className });
    return json({ ok: true, id }, 201);
  } catch (e) {
    console.error('Teacher assignment failed:', e);
    return json({ error: 'Could not create assignment. It may already exist.' }, 409);
  }
}
