import {
  getAuthenticatedUser,
  hashPassword,
  json,
  parseJson,
  randomId
} from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const auth = await getAuthenticatedUser(request, env);

    if (!auth.user) return auth.response;

    if (auth.user.role !== "PLATFORM_ADMIN") {
      return json({ error: "Platform administrator access required." }, 403);
    }

    const body = await parseJson(request);

    const schoolId = String(body?.school_id || "").trim();
    const plan = String(body?.plan || "STANDARD").trim();
    const paidUntil = String(
      body?.paid_until || body?.expires_at || ""
    ).trim();

    const adminName = String(
      body?.admin_name || body?.full_name || ""
    ).trim();

    const adminEmail = String(
      body?.admin_email || body?.email || ""
    ).trim().toLowerCase();

    const adminPassword = String(
      body?.admin_password || body?.password || ""
    );

    if (!schoolId) {
      return json({ error: "Select a school." }, 400);
    }

    if (!paidUntil) {
      return json({ error: "Select the school expiry date." }, 400);
    }

    if (!adminName || !adminEmail || !adminPassword) {
      return json({
        error: "School administrator name, email and password are required."
      }, 400);
    }

    if (adminPassword.length < 12) {
      return json({
        error: "School administrator password must be at least 12 characters."
      }, 400);
    }

    const school = await env.DB.prepare(`
      SELECT id, name
      FROM schools
      WHERE id = ?
      LIMIT 1
    `).bind(schoolId).first();

    if (!school) {
      return json({ error: "School was not found." }, 404);
    }

    const existingEmail = await env.DB.prepare(`
      SELECT id, school_id
      FROM auth_users
      WHERE email = ? COLLATE NOCASE
      LIMIT 1
    `).bind(adminEmail).first();

    if (existingEmail && String(existingEmail.school_id) !== schoolId) {
      return json({
        error: "That email already belongs to another account."
      }, 409);
    }

    await env.DB.prepare(`
      UPDATE schools
      SET status = 'Active'
      WHERE id = ?
    `).bind(schoolId).run();

    await env.DB.prepare(`
      INSERT INTO school_access (
        school_id,
        status,
        plan,
        paid_until,
        updated_at
      )
      VALUES (?, 'ACTIVE', ?, ?, CURRENT_TIMESTAMP)

      ON CONFLICT(school_id) DO UPDATE SET
        status = 'ACTIVE',
        plan = excluded.plan,
        paid_until = excluded.paid_until,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      schoolId,
      plan,
      paidUntil
    ).run();

    let adminId;

    if (existingEmail) {
      adminId = existingEmail.id;

      const { salt, hash } = await hashPassword(adminPassword);

      await env.DB.prepare(`
        UPDATE auth_users
        SET
          school_id = ?,
          full_name = ?,
          role = 'SCHOOL_ADMIN',
          password_salt = ?,
          password_hash = ?,
          active = 1
        WHERE id = ?
      `).bind(
        schoolId,
        adminName,
        salt,
        hash,
        adminId
      ).run();

    } else {
      adminId = randomId();

      const { salt, hash } = await hashPassword(adminPassword);

      await env.DB.prepare(`
        INSERT INTO auth_users (
          id,
          school_id,
          full_name,
          email,
          role,
          password_salt,
          password_hash,
          active
        )
        VALUES (?, ?, ?, ?, 'SCHOOL_ADMIN', ?, ?, 1)
      `).bind(
        adminId,
        schoolId,
        adminName,
        adminEmail,
        salt,
        hash
      ).run();
    }

    return json({
      ok: true,
      school_id: schoolId,
      school_name: school.name,
      status: "Active",
      plan,
      paid_until: paidUntil,
      admin_email: adminEmail,
      message:
        `${school.name} activated successfully. ` +
        `School administrator login is now active until ${paidUntil}.`
    });

  } catch (error) {
    console.error("School approval failed:", error);

    return json({
      error: "School approval could not be completed."
    }, 500);
  }
}