
import { json, requireRole } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireRole(request, env, [
    'PLATFORM_ADMIN',
    'SCHOOL_ADMIN'
  ]);

  if (!auth.user) return auth.response;

  const url = new URL(request.url);

  let schoolId = String(auth.user.school_id || '');

  if (auth.user.role === 'PLATFORM_ADMIN') {
    schoolId = String(url.searchParams.get('school_id') || '');
  }

  if (!schoolId) {
    return json({ error: 'school_id is required.' }, 400);
  }

  const role = String(url.searchParams.get('role') || '').toUpperCase();
  const search = String(url.searchParams.get('search') || '').trim();

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
  const offset = (page - 1) * limit;

  const validRoles = ['SCHOOL_ADMIN', 'SECRETARY', 'TEACHER', 'PARENT'];

  if (role && !validRoles.includes(role)) {
    return json({ error: 'Invalid role filter.' }, 400);
  }

  let where = 'WHERE CAST(school_id AS TEXT) = ?';
  const params = [schoolId];

  if (role) {
    where += ' AND role = ?';
    params.push(role);
  }

  if (search) {
    where += ' AND (full_name LIKE ? OR email LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term);
  }

  const [rows, count] = await Promise.all([
    env.DB.prepare(`
      SELECT id, school_id, full_name, email, role, active, created_at
      FROM auth_users
      ${where}
      ORDER BY role, full_name
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all(),

    env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM auth_users
      ${where}
    `).bind(...params).first()
  ]);

  const total = Number(count?.total || 0);

  return json({
    ok: true,
    users: rows.results || [],
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    }
  });
}
