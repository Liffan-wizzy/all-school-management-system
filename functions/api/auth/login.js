import {
  createSession,
  json,
  parseJson,
  verifyPassword,
} from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await parseJson(request);

    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return json({ error: "Email and password are required." }, 400);
    }

    const user = await env.DB.prepare(`
      SELECT
        id,
        school_id,
        full_name,
        email,
        role,
        password_salt,
        password_hash,
        active
      FROM auth_users
      WHERE email = ? COLLATE NOCASE
      LIMIT 1
    `)
      .bind(email)
      .first();

    if (!user) {
      return json({ error: "Invalid email or password." }, 401);
    }

    if (!user.active) {
      return json({ error: "This account is inactive." }, 403);
    }

    const valid = await verifyPassword(
      password,
      user.password_salt,
      user.password_hash
    );

    if (!valid) {
      return json({ error: "Invalid email or password." }, 401);
    }

    const cookie = await createSession(request, env, user.id);

    return json(
      {
        ok: true,
        user: {
          id: user.id,
          school_id: user.school_id,
          full_name: user.full_name,
          email: user.email,
          role: user.role,
        },
      },
      200,
      {
        "Set-Cookie": cookie,
      }
    );
  } catch (error) {
    console.error("Login error:", error);

    return json(
      { error: "Sign in could not be completed." },
      500
    );
  }
}