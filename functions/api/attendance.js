import { json, parseJson, requireRole, randomId } from '../_lib/auth.js';
import { findStudent, parentCanSeeStudent, writeAudit, studentShape } from '../_lib/workflows.js';
import { quoteIdentifier } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireRole(request, env, ['PLATFORM_ADMIN','SCHOOL_ADMIN','SECRETARY','TEACHER','PARENT']);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const schoolId = auth.user.role === 'PLATFORM_ADMIN' ? String(url.searchParams.get('school_id') || '') : String(auth.user.school_id);
  if (!schoolId) return json({ error: 'school_id is required.' }, 400);
  const shape = await studentShape(env.DB);
  const idCol = quoteIdentifier(shape.id); const schoolCol = quoteIdentifier(shape.school); const nameCol = quoteIdentifier(shape.name);
  const classExpr = shape.className ? `CAST(s.${quoteIdentifier(shape.className)} AS TEXT)` : `''`;
  let sql = `SELECT a.id, a.school_id, a.student_id, st.${nameCol} AS student_name, a.attendance_date, a.status, a.note, a.created_at
    FROM auth_attendance a JOIN students st ON CAST(st.${idCol} AS TEXT) = a.student_id
    WHERE CAST(a.school_id AS TEXT) = ? AND CAST(st.${schoolCol} AS TEXT) = ?`;
  const params = [schoolId, schoolId];
  if (auth.user.role === 'PARENT') { sql += ` AND EXISTS (SELECT 1 FROM auth_parent_students l WHERE l.parent_user_id = ? AND CAST(l.student_id AS TEXT) = a.student_id AND CAST(l.school_id AS TEXT) = ?)`; params.push(auth.user.id, schoolId); }
  if (auth.user.role === 'TEACHER') { sql += ` AND EXISTS (SELECT 1 FROM auth_teacher_assignments x WHERE x.teacher_user_id = ? AND CAST(x.school_id AS TEXT) = ? AND x.class_name = COALESCE((SELECT ${classExpr} FROM students s WHERE CAST(s.${idCol} AS TEXT) = a.student_id LIMIT 1), '') AND x.can_attend = 1)`; params.push(auth.user.id, schoolId); }
  const studentId = url.searchParams.get('student_id');
  if (studentId) { if (auth.user.role === 'PARENT' && !(await parentCanSeeStudent(env.DB, auth.user, studentId))) return json({ error: 'This student is not linked to your parent account.' }, 403); sql += ' AND CAST(a.student_id AS TEXT) = ?'; params.push(studentId); }
  const date = url.searchParams.get('date'); if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) { sql += ' AND a.attendance_date = ?'; params.push(date); }
  sql += ' ORDER BY a.attendance_date DESC LIMIT 1000';
  const result = await env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, attendance: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireRole(request, env, ['SCHOOL_ADMIN','SECRETARY','TEACHER']);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const studentId = String(body?.student_id || '');
  const date = String(body?.attendance_date || '');
  const status = String(body?.status || '').toUpperCase();
  const note = String(body?.note || '').trim().slice(0,500);
  if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !['PRESENT','ABSENT','LATE','EXCUSED'].includes(status)) return json({ error: 'Provide student_id, attendance_date (YYYY-MM-DD), and status PRESENT, ABSENT, LATE or EXCUSED.' }, 400);
  const student = await findStudent(env.DB, studentId, auth.user.school_id);
  if (!student) return json({ error: 'Student does not belong to your school.' }, 404);
  if (auth.user.role === 'TEACHER') {
    const assigned = await env.DB.prepare(`SELECT 1 AS ok FROM auth_teacher_assignments WHERE teacher_user_id = ? AND CAST(school_id AS TEXT) = ? AND class_name = ? AND can_attend = 1 LIMIT 1`)
      .bind(auth.user.id, String(auth.user.school_id), String(student.class_name || '')).first();
    if (!assigned) return json({ error: 'You are not assigned attendance access for this class.' }, 403);
  }
  const id = randomId();
  try {
    await env.DB.prepare(`INSERT INTO auth_attendance (id, school_id, student_id, attendance_date, status, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(school_id, student_id, attendance_date) DO UPDATE SET status = excluded.status, note = excluded.note, created_by = excluded.created_by`)
      .bind(id, String(auth.user.school_id), studentId, date, status, note, auth.user.id).run();
    await writeAudit(env.DB, auth.user, auth.user.school_id, 'ATTENDANCE_UPSERT', 'attendance', studentId, { attendance_date: date, status });
    return json({ ok: true, message: 'Attendance saved.' }, 201);
  } catch (e) {
    console.error('Attendance write failed:', e);
    return json({ error: 'Could not save attendance. Confirm the student schema and migration.' }, 500);
  }
}
