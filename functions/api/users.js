import { json, requireRole } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireRole(request, env, ['PLATFORM_ADMIN','SCHOOL_ADMIN']);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  let schoolId = String(auth.user.school_id || '');
  if (auth.user.role === 'PLATFORM_ADMIN') schoolId = String(url.searchParams.get('school_id') || '');
  if (!schoolId) return json({ error: 'school_id is required.' }, 400);
  const role = String(url.searchParams.get('role') || '').toUpperCase();
  const validRoles = ['SCHOOL_ADMIN','SECRETARY','TEACHER','PARENT'];
  let sql = `SELECT id, school_id, full_name, email, role, active, created_at FROM auth_users WHERE CAST(school_id AS TEXT) = ?`;
  const params = [schoolId];
  if (role) {
    if (!validRoles.includes(role)) return json({ error: 'Invalid role filter.' }, 400);
    sql += ' AND role = ?'; params.push(role);
  }
  sql += ' ORDER BY role, full_name LIMIT 500';
  const rows = await env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, users: rows.results || [] });
}
