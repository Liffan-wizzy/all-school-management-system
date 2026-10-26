import { getTableInfo, hashPassword, json, parseJson, pickColumn, quoteIdentifier, randomId } from '../../_lib/auth.js';

function validPaidUntil(value) {
  if (!value) return false;
  const raw = String(value).trim();
  const expiry = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw);
  return Number.isFinite(expiry) && expiry >= Date.now();
}

async function findSchool(db, requestedId) {
  const columns = await getTableInfo(db, 'schools');
  const idCol = pickColumn(columns, ['id', 'school_id']);
  const nameCol = pickColumn(columns, ['name', 'school_name', 'title']);
  if (!idCol || !nameCol) throw new Error('The schools table is missing its ID or name column.');
  const row = await db.prepare(`SELECT CAST(${quoteIdentifier(idCol)} AS TEXT) AS id, ${quoteIdentifier(nameCol)} AS name
    FROM schools WHERE CAST(${quoteIdentifier(idCol)} AS TEXT) = ? LIMIT 1`).bind(String(requestedId)).first();
  return row || null;
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await parseJson(request);
    const schoolId = String(body?.school_id || '').trim();
    const fullName = String(body?.full_name || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const role = String(body?.role || '').trim().toUpperCase();
    const password = body?.password;
    const studentRef = String(body?.student_ref || '').trim();

    if (!schoolId || fullName.length < 2 || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Choose a school and enter your full name and a valid email.' }, 400);
    }
    if (!['SECRETARY', 'FINANCE_OFFICE', 'TEACHER', 'PARENT'].includes(role)) {
      return json({ error: 'Public registration is only for secretary, teacher, or parent access. School administrators are appointed by the platform.' }, 400);
    }
    if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
      return json({ error: 'Use a password between 12 and 200 characters.' }, 400);
    }
    if (role === 'PARENT' && (studentRef.length < 2 || studentRef.length > 100)) {
      return json({ error: 'Parents must enter the child’s admission number for school verification.' }, 400);
    }

    const school = await findSchool(env.DB, schoolId);
    if (!school) return json({ error: 'Selected school was not found.' }, 404);
    const access = await env.DB.prepare('SELECT status, paid_until FROM school_access WHERE school_id = ? LIMIT 1').bind(school.id).first();
    if (!access || access.status !== 'ACTIVE' || !validPaidUntil(access.paid_until)) {
      return json({ error: 'This school is not accepting registrations because its access is pending, suspended, or expired.' }, 403);
    }

    const existingAccount = await env.DB.prepare('SELECT id FROM auth_users WHERE email = ? COLLATE NOCASE LIMIT 1').bind(email).first();
    if (existingAccount) return json({ error: 'An account already uses this email. Sign in or contact the school administrator.' }, 409);
    const existingRequest = await env.DB.prepare("SELECT id FROM auth_registration_requests WHERE email = ? COLLATE NOCASE AND status = 'PENDING' LIMIT 1").bind(email).first();
    if (existingRequest) return json({ error: 'A registration request for this email is already waiting for approval.' }, 409);

    const passwordParts = await hashPassword(password);
    const id = randomId();
    await env.DB.prepare(`INSERT INTO auth_registration_requests
      (id, school_id, full_name, email, role, password_salt, password_hash, student_ref, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`)
      .bind(id, school.id, fullName, email, role, passwordParts.salt, passwordParts.hash, role === 'PARENT' ? studentRef : null)
      .run();

    return json({ ok: true, request_id: id, status: 'PENDING', message: 'Registration received. Your school must approve it before you can sign in.' }, 201);
  } catch (error) {
    console.error('Role registration failed:', error);
    return json({ error: 'Registration could not be completed. Confirm the role-registration migration has been applied.' }, 500);
  }
}
