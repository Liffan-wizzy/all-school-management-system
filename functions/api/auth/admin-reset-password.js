import { hashPassword, json, parseJson, requireRole } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const auth = await requireRole(request, env, ['PLATFORM_ADMIN','SCHOOL_ADMIN']);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const userId = String(body?.user_id || '');
  const password = body?.new_password;
  if (!userId || typeof password !== 'string' || password.length < 12 || password.length > 200) return json({ error: 'Provide user_id and a new password of 12–200 characters.' }, 400);
  const target = await env.DB.prepare('SELECT id, school_id, role FROM auth_users WHERE id = ? LIMIT 1').bind(userId).first();
  if (!target) return json({ error: 'User not found.' }, 404);
  if (auth.user.role !== 'PLATFORM_ADMIN' && (String(target.school_id) !== String(auth.user.school_id) || target.role === 'PLATFORM_ADMIN' || target.role === 'SCHOOL_ADMIN')) return json({ error: 'School admins may reset only non-admin accounts in their own school.' }, 403);
  const parts = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare('UPDATE auth_users SET password_salt = ?, password_hash = ? WHERE id = ?').bind(parts.salt, parts.hash, userId),
    env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(userId),
  ]);
  return json({ ok: true, message: 'Password reset. The user must sign in again.' });
}
