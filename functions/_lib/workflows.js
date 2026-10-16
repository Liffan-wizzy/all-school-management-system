import { getTableInfo, pickColumn, quoteIdentifier, json, randomId } from './auth.js';

export async function studentShape(db) {
  const columns = await getTableInfo(db, 'students');
  const id = pickColumn(columns, ['id', 'student_id']);
  const school = pickColumn(columns, ['school_id']);
  const name = pickColumn(columns, ['full_name', 'name', 'student_name']);
  const admission = pickColumn(columns, ['admission_no', 'admission_number', 'admission_code']);
  const className = pickColumn(columns, ['class_name', 'class', 'grade', 'form']);
  if (!id || !school || !name) throw new Error('students must have an ID, school_id and name column');
  return { columns, id, school, name, admission, className };
}

export async function findStudent(db, studentId, schoolId) {
  const shape = await studentShape(db);
  const classSql = shape.className ? `, ${quoteIdentifier(shape.className)} AS class_name` : ', NULL AS class_name';
  const admissionSql = shape.admission ? `, ${quoteIdentifier(shape.admission)} AS admission_no` : ', NULL AS admission_no';
  return db.prepare(`SELECT CAST(${quoteIdentifier(shape.id)} AS TEXT) AS id,
    ${quoteIdentifier(shape.name)} AS full_name${classSql}${admissionSql}
    FROM students WHERE CAST(${quoteIdentifier(shape.id)} AS TEXT) = ?
      AND CAST(${quoteIdentifier(shape.school)} AS TEXT) = ? LIMIT 1`)
    .bind(String(studentId), String(schoolId)).first();
}

export async function requireStudentScope(db, studentId, schoolId) {
  const student = await findStudent(db, studentId, schoolId);
  return student || null;
}

export async function parentCanSeeStudent(db, user, studentId) {
  if (user.role !== 'PARENT') return true;
  const row = await db.prepare(`SELECT 1 AS ok FROM auth_parent_students
    WHERE parent_user_id = ? AND CAST(school_id AS TEXT) = ? AND CAST(student_id AS TEXT) = ? LIMIT 1`)
    .bind(user.id, String(user.school_id), String(studentId)).first();
  return Boolean(row);
}

export async function teacherHasAssignment(db, user, subjectId, className, permission = 'can_mark') {
  if (user.role !== 'TEACHER') return true;
  const permittedColumn = permission === 'can_attend' ? 'can_attend' : 'can_mark';
  const row = await db.prepare(`SELECT 1 AS ok FROM auth_teacher_assignments
    WHERE teacher_user_id = ? AND CAST(school_id AS TEXT) = ? AND subject_id = ?
      AND class_name = ? AND ${permittedColumn} = 1 LIMIT 1`)
    .bind(user.id, String(user.school_id), String(subjectId), String(className || '')).first();
  return Boolean(row);
}

export async function writeAudit(db, user, schoolId, action, entityType, entityId = '', details = {}) {
  await db.prepare(`INSERT INTO auth_audit_events
    (id, school_id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(randomId(), schoolId == null ? null : String(schoolId), user?.id || null,
      String(action).slice(0, 100), String(entityType).slice(0, 100), String(entityId).slice(0, 160),
      JSON.stringify(details).slice(0, 2000)).run();
}

export function invalidBody() {
  return json({ error: 'A valid JSON object is required.' }, 400);
}

export function amountNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}
