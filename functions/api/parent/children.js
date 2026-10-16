import { getAuthenticatedUser, getTableInfo, json, pickColumn, quoteIdentifier } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  try {
    const auth = await getAuthenticatedUser(request, env);
    if (!auth.user) return auth.response;
    if (auth.user.role !== 'PARENT') return json({ error: 'This endpoint is for parent accounts only.' }, 403);

    const columns = await getTableInfo(env.DB, 'students');
    const idCol = pickColumn(columns, ['id', 'student_id']);
    const schoolCol = pickColumn(columns, ['school_id']);
    const nameCol = pickColumn(columns, ['full_name', 'name', 'student_name']);
    const admissionCol = pickColumn(columns, ['admission_no', 'admission_number', 'admission_code']);
    const classCol = pickColumn(columns, ['class_name', 'class', 'grade', 'form']);
    const streamCol = pickColumn(columns, ['stream']);
    const genderCol = pickColumn(columns, ['gender']);
    if (!idCol || !schoolCol || !nameCol) return json({ error: 'Student schema is missing required ID, school_id, or name columns.' }, 500);

    const select = [
      `CAST(s.${quoteIdentifier(idCol)} AS TEXT) AS student_id`,
      `s.${quoteIdentifier(nameCol)} AS full_name`,
      admissionCol ? `s.${quoteIdentifier(admissionCol)} AS admission_no` : 'NULL AS admission_no',
      classCol ? `s.${quoteIdentifier(classCol)} AS class_name` : 'NULL AS class_name',
      streamCol ? `s.${quoteIdentifier(streamCol)} AS stream` : 'NULL AS stream',
      genderCol ? `s.${quoteIdentifier(genderCol)} AS gender` : 'NULL AS gender',
    ];
    const sql = `SELECT ${select.join(', ')} FROM auth_parent_students l
      JOIN students s ON CAST(s.${quoteIdentifier(idCol)} AS TEXT) = l.student_id
      WHERE l.parent_user_id = ? AND CAST(l.school_id AS TEXT) = ?
        AND CAST(s.${quoteIdentifier(schoolCol)} AS TEXT) = ?
      ORDER BY s.${quoteIdentifier(nameCol)} COLLATE NOCASE`;
    const result = await env.DB.prepare(sql).bind(auth.user.id, String(auth.user.school_id), String(auth.user.school_id)).all();
    return json({ ok: true, children: result.results || [] });
  } catch (error) {
    console.error('Parent child list failed:', error);
    return json({ error: 'Could not load the children linked to this parent account.' }, 500);
  }
}
