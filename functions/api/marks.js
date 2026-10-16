import { json, parseJson, requireRole, randomId } from '../_lib/auth.js';
import { findStudent, parentCanSeeStudent, teacherHasAssignment, writeAudit, studentShape } from '../_lib/workflows.js';
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
  let sql = `SELECT m.id, m.school_id, m.student_id, st.${nameCol} AS student_name, m.subject_id, sub.name AS subject_name,
    m.assessment_name, m.term, m.score, m.max_score, m.remarks, m.created_at
    FROM auth_marks m JOIN students st ON CAST(st.${idCol} AS TEXT) = m.student_id
    JOIN auth_subjects sub ON sub.id = m.subject_id WHERE CAST(m.school_id AS TEXT) = ? AND CAST(st.${schoolCol} AS TEXT) = ?`;
  const params = [schoolId, schoolId];
  if (auth.user.role === 'PARENT') { sql += ` AND EXISTS (SELECT 1 FROM auth_parent_students l WHERE l.parent_user_id = ? AND CAST(l.student_id AS TEXT) = m.student_id AND CAST(l.school_id AS TEXT) = ?)`; params.push(auth.user.id, schoolId); }
  if (auth.user.role === 'TEACHER') { sql += ` AND EXISTS (SELECT 1 FROM auth_teacher_assignments a WHERE a.teacher_user_id = ? AND a.subject_id = m.subject_id AND CAST(a.school_id AS TEXT) = ? AND a.class_name = COALESCE((SELECT ${classExpr} FROM students s WHERE CAST(s.${idCol} AS TEXT) = m.student_id LIMIT 1),''))`; params.push(auth.user.id, schoolId); }
  const studentId = url.searchParams.get('student_id');
  if (studentId) { if (auth.user.role === 'PARENT' && !(await parentCanSeeStudent(env.DB, auth.user, studentId))) return json({ error: 'This student is not linked to your parent account.' }, 403); sql += ' AND CAST(m.student_id AS TEXT) = ?'; params.push(studentId); }
  sql += ' ORDER BY m.created_at DESC LIMIT 500';
  const result = await env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, marks: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireRole(request, env, ['SCHOOL_ADMIN','TEACHER']);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const studentId = String(body?.student_id || '');
  const subjectId = String(body?.subject_id || '');
  const assessment = String(body?.assessment_name || '').trim().slice(0,100);
  const term = String(body?.term || '').trim().slice(0,40);
  const score = Number(body?.score); const maxScore = Number(body?.max_score);
  const remarks = String(body?.remarks || '').trim().slice(0,500);
  if (!studentId || !subjectId || !assessment || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore) return json({ error: 'Provide student_id, subject_id, assessment_name, a valid score and max_score.' }, 400);
  const student = await findStudent(env.DB, studentId, auth.user.school_id);
  if (!student) return json({ error: 'Student does not belong to your school.' }, 404);
  const subject = await env.DB.prepare('SELECT id, class_name FROM auth_subjects WHERE id = ? AND CAST(school_id AS TEXT) = ? LIMIT 1').bind(subjectId, String(auth.user.school_id)).first();
  if (!subject) return json({ error: 'Subject does not belong to your school.' }, 404);
  if (auth.user.role === 'TEACHER' && (String(subject.class_name) !== String(student.class_name || '') || !(await teacherHasAssignment(env.DB, auth.user, subjectId, student.class_name, 'can_mark')))) return json({ error: 'You are not assigned to mark this subject and class.' }, 403);
  const id = randomId();
  await env.DB.prepare(`INSERT INTO auth_marks (id, school_id, student_id, subject_id, assessment_name, term, score, max_score, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, String(auth.user.school_id), studentId, subjectId, assessment, term, score, maxScore, remarks, auth.user.id).run();
  await writeAudit(env.DB, auth.user, auth.user.school_id, 'MARK_CREATE', 'mark', id, { student_id: studentId, subject_id: subjectId, term, score, max_score: maxScore });
  return json({ ok: true, id }, 201);
}
