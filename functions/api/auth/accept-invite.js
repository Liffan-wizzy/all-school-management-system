import { hashPassword, json, parseJson, randomId, sha256Base64Url } from '../../_lib/auth.js';
import { findStudent, writeAudit } from '../../_lib/workflows.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await parseJson(request);
    const token = String(body?.invite_code || '').trim();
    const fullName = String(body?.full_name || '').trim();
    const password = body?.password;
    if (!token || fullName.length < 2 || fullName.length > 120 || typeof password !== 'string' || password.length < 12 || password.length > 200) return json({ error: 'Provide a valid invite_code, full_name, and password of 12–200 characters.' }, 400);
    const hash = await sha256Base64Url(token);
    const invite = await env.DB.prepare(`SELECT id, school_id, email, role, student_ref, expires_at, claimed_at FROM auth_invitations WHERE token_hash = ? LIMIT 1`).bind(hash).first();
    if (!invite || invite.claimed_at || Date.parse(invite.expires_at) < Date.now()) return json({ error: 'Invitation is invalid, expired or already used.' }, 400);
    const access = await env.DB.prepare('SELECT status, paid_until FROM school_access WHERE CAST(school_id AS TEXT) = ? LIMIT 1').bind(String(invite.school_id)).first();
    const expiryRaw = String(access?.paid_until || '');
    const expiry = /^\d{4}-\d{2}-\d{2}$/.test(expiryRaw) ? Date.parse(`${expiryRaw}T23:59:59.999Z`) : Date.parse(expiryRaw);
    if (!access || access.status !== 'ACTIVE' || !Number.isFinite(expiry) || expiry < Date.now()) return json({ error: 'School access is not active.' }, 403);
    const existing = await env.DB.prepare('SELECT id FROM auth_users WHERE email = ? COLLATE NOCASE LIMIT 1').bind(invite.email).first();
    if (existing) return json({ error: 'This email already has an account. Contact the school administrator.' }, 409);
    let student = null;
    if (invite.role === 'PARENT') {
      const shape = await (async () => {
        const cols = await env.DB.prepare('PRAGMA table_info("students")').all();
        const names = new Map((cols.results || []).map((c) => [String(c.name).toLowerCase(), c.name]));
        return { id: names.get('id') || names.get('student_id'), school: names.get('school_id'), admission: names.get('admission_no') || names.get('admission_number') || names.get('admission_code') };
      })();
      if (!shape.id || !shape.school || !shape.admission) return json({ error: 'Student schema does not have a recognized admission-number column.' }, 500);
      student = await env.DB.prepare(`SELECT CAST(${JSON.stringify(shape.id)} AS TEXT) AS id FROM students WHERE CAST(${JSON.stringify(shape.school)} AS TEXT) = ? AND CAST(${JSON.stringify(shape.admission)} AS TEXT) = ? LIMIT 1`).bind(String(invite.school_id), String(invite.student_ref)).first();
      if (!student) return json({ error: 'Child admission number was not found in this school. Contact the school office.' }, 404);
    }
    const parts = await hashPassword(password);
    const userId = randomId();
    const statements = [
      env.DB.prepare(`INSERT INTO auth_users (id, school_id, full_name, email, role, password_salt, password_hash, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`)
        .bind(userId, String(invite.school_id), fullName, invite.email, invite.role, parts.salt, parts.hash),
      env.DB.prepare('UPDATE auth_invitations SET claimed_at = CURRENT_TIMESTAMP WHERE id = ? AND claimed_at IS NULL').bind(invite.id),
    ];
    if (student) statements.splice(1, 0, env.DB.prepare(`INSERT INTO auth_parent_students (id, parent_user_id, school_id, student_id, linked_by) VALUES (?, ?, ?, ?, ?)`)
      .bind(randomId(), userId, String(invite.school_id), String(student.id), invite.created_by));
    await env.DB.batch(statements);
    await writeAudit(env.DB, { id: userId }, invite.school_id, 'INVITATION_ACCEPT', 'user', userId, { role: invite.role, email: invite.email });
    return json({ ok: true, user_id: userId, role: invite.role, message: 'Invitation accepted. You can now sign in.' }, 201);
  } catch (error) {
    console.error('Invite acceptance failed:', error);
    return json({ error: 'Could not accept invitation. Verify the database migration and invitation details.' }, 500);
  }
}
