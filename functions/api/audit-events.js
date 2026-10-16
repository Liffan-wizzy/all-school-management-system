import { json, requireRole } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireRole(request, env, ['PLATFORM_ADMIN','SCHOOL_ADMIN']);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100));
  let rows;
  if (auth.user.role === 'PLATFORM_ADMIN') {
    const schoolId = String(url.searchParams.get('school_id') || '');
    if (schoolId) rows = await env.DB.prepare(`SELECT e.*, u.full_name AS actor_name, u.email AS actor_email FROM auth_audit_events e LEFT JOIN auth_users u ON u.id = e.actor_user_id WHERE CAST(e.school_id AS TEXT) = ? ORDER BY e.created_at DESC LIMIT ?`).bind(schoolId, limit).all();
    else rows = await env.DB.prepare(`SELECT e.*, u.full_name AS actor_name, u.email AS actor_email FROM auth_audit_events e LEFT JOIN auth_users u ON u.id = e.actor_user_id ORDER BY e.created_at DESC LIMIT ?`).bind(limit).all();
  } else {
    rows = await env.DB.prepare(`SELECT e.*, u.full_name AS actor_name, u.email AS actor_email FROM auth_audit_events e LEFT JOIN auth_users u ON u.id = e.actor_user_id WHERE CAST(e.school_id AS TEXT) = ? ORDER BY e.created_at DESC LIMIT ?`).bind(String(auth.user.school_id), limit).all();
  }
  return json({ ok: true, events: rows.results || [] });
}
