import {
  hashPassword,
  json,
  parseJson,
  randomId
} from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await parseJson(request);

    const fullName = String(body?.full_name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!fullName || !email || !password) {
      return json(
        { error: "Full name, email and password are required." },
        400
      );
    }

    if (password.length < 12) {
      return json(
        { error: "Password must be at least 12 characters." },
        400
      );
    }

    // Bootstrap must work only when no platform admin exists.
    const existingAdmin = await env.DB.prepare(`
      SELECT id
      FROM auth_users
      WHERE role = 'PLATFORM_ADMIN'
      LIMIT 1
    `).first();

    if (existingAdmin) {
      return json(
        { error: "Platform administrator already exists." },
        409
      );
    }

    const existingEmail = await env.DB.prepare(`
      SELECT id
      FROM auth_users
      WHERE email = ? COLLATE NOCASE
      LIMIT 1
    `).bind(email).first();

    if (existingEmail) {
      return json({ error: "Email is already registered." }, 409);
    }

    const { salt, hash } = await hashPassword(password);

    const id = randomId();

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
      VALUES (?, NULL, ?, ?, 'PLATFORM_ADMIN', ?, ?, 1)
    `).bind(
      id,
      fullName,
      email,
      salt,
      hash
    ).run();

    return json({
      ok: true,
      message: "Liffan Platform Administrator created.",
      user: {
        id,
        full_name: fullName,
        email,
        role: "PLATFORM_ADMIN"
      }
    }, 201);

  } catch (error) {
    console.error("Platform bootstrap error:", error);

    return json(
      { error: "Platform administrator could not be created." },
      500
    );
  }
}