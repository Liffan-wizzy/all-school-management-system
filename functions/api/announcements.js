
import { json, parseJson, requireRole, randomId } from '../_lib/auth.js';
import { writeAudit } from '../_lib/workflows.js';

const STAFF_ROLES = [
  'SCHOOL_ADMIN',
  'DEPUTY',
  'SENIOR_MANAGER',
  'SECRETARY',
  'FINANCE_OFFICE',
  'TEACHER'
];

export async function onRequestGet({ request, env }) {
  const auth = await requireRole(request, env, [
    ...STAFF_ROLES,
    'PARENT'
  ]);

  if (!auth.user) return auth.response;

  const user = auth.user;
  const schoolId = String(user.school_id || '');

  if (!schoolId) {
    return json({ error: 'School account is required.' }, 400);
  }

  let sql = `
    SELECT
      a.id,
      a.school_id,
      a.title,
      a.body,
      a.audience,
      a.created_at,
      u.full_name AS author
    FROM auth_announcements a
    LEFT JOIN auth_users u ON u.id = a.created_by
    WHERE CAST(a.school_id AS TEXT) = ?
  `;

  if (user.role === 'PARENT') {
    sql += " AND a.audience IN ('ALL', 'PARENTS')";
  } else if (user.role === 'TEACHER') {
    sql += " AND a.audience IN ('ALL', 'TEACHERS', 'STAFF')";
  } else if (user.role === 'FINANCE_OFFICE') {
    sql += " AND a.audience IN ('ALL', 'STAFF')";
  } else {
    sql += " AND a.audience IN ('ALL', 'PARENTS', 'TEACHERS', 'STAFF')";
  }

  sql += ' ORDER BY a.created_at DESC LIMIT 200';

  try {
    const rows = await env.DB.prepare(sql).bind(schoolId).all();

    return json({
      ok: true,
      announcements: rows.results || []
    });
  } catch (error) {
    console.error('Announcements GET failed:', error);
    return json({ error: 'Unable to load announcements.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await requireRole(request, env, [
    'SCHOOL_ADMIN',
    'DEPUTY',
    'SENIOR_MANAGER',
    'SECRETARY'
  ]);

  if (!auth.user) return auth.response;

  const body = await parseJson(request);

  const title = String(body?.title || '').trim().slice(0, 160);
  const text = String(body?.body || '').trim().slice(0, 5000);
  const audience = String(body?.audience || 'ALL').toUpperCase();

  if (!title || !text || !['ALL', 'PARENTS', 'TEACHERS', 'STAFF'].includes(audience)) {
    return json({
      error: 'Provide a title, message and valid audience.'
    }, 400);
  }

  const id = randomId();

  try {
    await env.DB.prepare(`
      INSERT INTO auth_announcements
        (id, school_id, title, body, audience, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      String(auth.user.school_id),
      title,
      text,
      audience,
      auth.user.id
    ).run();

    await writeAudit(
      env.DB,
      auth.user,
      auth.user.school_id,
      'ANNOUNCEMENT_CREATE',
      'announcement',
      id,
      { title, audience }
    );

    return json({ ok: true, id }, 201);
  } catch (error) {
    console.error('Announcements POST failed:', error);
    return json({ error: 'Unable to publish announcement.' }, 500);
  }
}
