import { json, requireRole, quoteIdentifier } from '../_lib/auth.js';
import { studentShape } from '../_lib/workflows.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireRole(request, env, ['PLATFORM_ADMIN','SCHOOL_ADMIN','SECRETARY','PARENT']);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const schoolId = auth.user.role === 'PLATFORM_ADMIN' ? String(url.searchParams.get('school_id') || '') : String(auth.user.school_id);
  if (!schoolId) return json({ error: 'school_id is required.' }, 400);
  const shape = await studentShape(env.DB);
  const studentIdCol = quoteIdentifier(shape.id); const studentSchoolCol = quoteIdentifier(shape.school);
  const parentFilter = auth.user.role === 'PARENT';
  const studentWhere = parentFilter ? ` AND EXISTS (SELECT 1 FROM auth_parent_students l WHERE l.parent_user_id = ? AND CAST(l.school_id AS TEXT) = ? AND CAST(l.student_id AS TEXT) = CAST(st.${studentIdCol} AS TEXT))` : '';
  const countParams = parentFilter ? [schoolId, auth.user.id, schoolId] : [schoolId];
  const studentCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM students st WHERE CAST(st.${studentSchoolCol} AS TEXT) = ?${studentWhere}`).bind(...countParams).first();
  const parentExists = (columnAlias) => parentFilter ? ` AND EXISTS (SELECT 1 FROM auth_parent_students l WHERE l.parent_user_id = ? AND CAST(l.school_id AS TEXT) = ? AND CAST(l.student_id AS TEXT) = CAST(${columnAlias}.student_id AS TEXT))` : '';
  const bindScoped = (extra) => parentFilter ? [schoolId, schoolId, auth.user.id, schoolId] : [schoolId, schoolId];
  const attendance = await env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) AS present,
    SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent
    FROM auth_attendance a JOIN students st ON CAST(st.${studentIdCol} AS TEXT) = a.student_id
    WHERE CAST(a.school_id AS TEXT) = ? AND CAST(st.${studentSchoolCol} AS TEXT) = ?${parentExists('a')}`).bind(...bindScoped()).first();
  const fee = await env.DB.prepare(`SELECT SUM(CASE WHEN f.entry_type = 'CHARGE' THEN f.amount WHEN f.entry_type = 'PAYMENT' THEN -f.amount ELSE f.amount END) AS balance
    FROM auth_fee_transactions f JOIN students st ON CAST(st.${studentIdCol} AS TEXT) = f.student_id
    WHERE CAST(f.school_id AS TEXT) = ? AND CAST(st.${studentSchoolCol} AS TEXT) = ?${parentExists('f')}`).bind(...bindScoped()).first();
  const mark = await env.DB.prepare(`SELECT AVG((m.score / m.max_score) * 100.0) AS average_score
    FROM auth_marks m JOIN students st ON CAST(st.${studentIdCol} AS TEXT) = m.student_id
    WHERE CAST(m.school_id AS TEXT) = ? AND CAST(st.${studentSchoolCol} AS TEXT) = ?${parentExists('m')}`).bind(...bindScoped()).first();
  return json({ ok: true, school_id: schoolId, summary: {
    students: Number(studentCount?.count || 0),
    attendance_records: Number(attendance?.total || 0), present: Number(attendance?.present || 0), absent: Number(attendance?.absent || 0),
    fee_balance: Number(fee?.balance || 0), average_score_percent: mark?.average_score == null ? null : Math.round(Number(mark.average_score) * 100) / 100,
  } });
}
