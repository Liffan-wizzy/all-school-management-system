import { json, parseJson, requireRole, randomId } from '../_lib/auth.js';
import { findStudent, parentCanSeeStudent, writeAudit, studentShape } from '../_lib/workflows.js';
import { quoteIdentifier } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireRole(request, env, ['PLATFORM_ADMIN','SCHOOL_ADMIN','SECRETARY','PARENT']);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const schoolId = auth.user.role === 'PLATFORM_ADMIN' ? String(url.searchParams.get('school_id') || '') : String(auth.user.school_id);
  if (!schoolId) return json({ error: 'school_id is required.' }, 400);
  const shape = await studentShape(env.DB);
  const idCol = quoteIdentifier(shape.id); const schoolCol = quoteIdentifier(shape.school); const nameCol = quoteIdentifier(shape.name);
  let sql = `SELECT f.id, f.school_id, f.student_id, st.${nameCol} AS student_name, f.entry_type, f.amount, f.description, f.reference, f.transaction_date, f.created_at
    FROM auth_fee_transactions f JOIN students st ON CAST(st.${idCol} AS TEXT) = f.student_id
    WHERE CAST(f.school_id AS TEXT) = ? AND CAST(st.${schoolCol} AS TEXT) = ?`;
  const params = [schoolId, schoolId];
  if (auth.user.role === 'PARENT') { sql += ` AND EXISTS (SELECT 1 FROM auth_parent_students l WHERE l.parent_user_id = ? AND CAST(l.student_id AS TEXT) = f.student_id AND CAST(l.school_id AS TEXT) = ?)`; params.push(auth.user.id, schoolId); }
  const studentId = url.searchParams.get('student_id');
  if (studentId) { if (auth.user.role === 'PARENT' && !(await parentCanSeeStudent(env.DB, auth.user, studentId))) return json({ error: 'This student is not linked to your parent account.' }, 403); sql += ' AND CAST(f.student_id AS TEXT) = ?'; params.push(studentId); }
  sql += ' ORDER BY f.transaction_date DESC, f.created_at DESC LIMIT 1000';
  const rows = await env.DB.prepare(sql).bind(...params).all();
  const tx = rows.results || [];
  const summary = tx.reduce((sum, item) => { const amount = Number(item.amount) || 0; if (item.entry_type === 'CHARGE') sum.charged += amount; else if (item.entry_type === 'PAYMENT') sum.paid += amount; else sum.adjustments += amount; return sum; }, { charged: 0, paid: 0, adjustments: 0 });
  summary.balance = summary.charged + summary.adjustments - summary.paid;
  return json({ ok: true, transactions: tx, summary });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireRole(request, env, ['SCHOOL_ADMIN','SECRETARY']);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const studentId = String(body?.student_id || '');
  const type = String(body?.entry_type || '').toUpperCase();
  const amount = Number(body?.amount);
  const description = String(body?.description || '').trim().slice(0,250);
  const reference = String(body?.reference || '').trim().slice(0,120);
  const transactionDate = String(body?.transaction_date || new Date().toISOString().slice(0,10));
  if (!studentId || !['CHARGE','PAYMENT','ADJUSTMENT'].includes(type) || !Number.isFinite(amount) || amount <= 0 || !description || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) return json({ error: 'Provide student_id, valid entry_type, positive amount, description and transaction_date.' }, 400);
  if (type === 'ADJUSTMENT' && auth.user.role !== 'SCHOOL_ADMIN') return json({ error: 'Only school administrators can create adjustments.' }, 403);
  const student = await findStudent(env.DB, studentId, auth.user.school_id);
  if (!student) return json({ error: 'Student does not belong to your school.' }, 404);
  const id = randomId();
  await env.DB.prepare(`INSERT INTO auth_fee_transactions (id, school_id, student_id, entry_type, amount, description, reference, transaction_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, String(auth.user.school_id), studentId, type, amount, description, reference, transactionDate, auth.user.id).run();
  await writeAudit(env.DB, auth.user, auth.user.school_id, 'FEE_TRANSACTION_CREATE', 'fee_transaction', id, { student_id: studentId, entry_type: type, amount, reference });
  return json({ ok: true, id }, 201);
}
