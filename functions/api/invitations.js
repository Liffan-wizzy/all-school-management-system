import { json, parseJson, requireRole, randomId, makeRandomToken, sha256Base64Url } from '../_lib/auth.js';
import { writeAudit } from '../_lib/workflows.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireRole(request, env, ['SCHOOL_ADMIN']);
  if (!auth.user) return auth.response;
  const rows = await env.DB.prepare(`SELECT id, email, role, student_ref, expires_at, claimed_at, created_at FROM auth_invitations WHERE CAST(school_id AS TEXT) = ? ORDER BY created_at DESC LIMIT 200`).bind(String(auth.user.school_id)).all();
  return json({ ok: true, invitations: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireRole(request, env, ['SCHOOL_ADMIN']);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const email = String(body?.email || '').trim().toLowerCase();
  const role = String(body?.role || '').toUpperCase();
  const studentRef = String(body?.student_ref || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['SECRETARY','TEACHER','PARENT'].includes(role)) return json({ error: 'Provide a valid email and role SECRETARY, TEACHER or PARENT.' }, 400);
  if (role === 'PARENT' && !studentRef) return json({ error: 'Parent invitations must include the child admission number.' }, 400);
  const exists = await env.DB.prepare('SELECT id FROM auth_users WHERE email = ? COLLATE NOCASE LIMIT 1').bind(email).first();
  if (exists) return json({ error: 'This email already has an account.' }, 409);
  const rawToken = makeRandomToken(32);
  const hash = await sha256Base64Url(rawToken);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const id = randomId();
  await env.DB.prepare(`INSERT INTO auth_invitations (id, school_id, email, role, student_ref, token_hash, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, String(auth.user.school_id), email, role, role === 'PARENT' ? studentRef : null, hash, expiresAt, auth.user.id).run();
  await writeAudit(env.DB, auth.user, auth.user.school_id, 'INVITATION_CREATE', 'invitation', id, { email, role, expires_at: expiresAt });
  return json({ ok: true, invitation_id: id, invite_code: rawToken, expires_at: expiresAt, message: 'Copy this one-time code and share it with the intended person through a trusted channel. The code is shown only once.' }, 201);
}
