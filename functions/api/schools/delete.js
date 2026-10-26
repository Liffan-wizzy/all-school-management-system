import {
  getAuthenticatedUser,
  json,
  parseJson
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

    if (!schoolId) {
      return json({ error: "School ID is required." }, 400);
    }

    const school = await env.DB.prepare(
      `SELECT id, name FROM schools WHERE id = ? LIMIT 1`
    ).bind(schoolId).first();

    if (!school) {
      return json({ error: "School not found." }, 404);
    }

    // Remove authentication sessions first.
    await env.DB.prepare(`
      DELETE FROM auth_sessions
      WHERE user_id IN (
        SELECT id FROM auth_users WHERE school_id = ?
      )
    `).bind(schoolId).run();

    // Remove school authentication accounts.
    await env.DB.prepare(
      `DELETE FROM auth_users WHERE school_id = ?`
    ).bind(schoolId).run();

    // Remove subscription/access record.
    await env.DB.prepare(
      `DELETE FROM school_access WHERE school_id = ?`
    ).bind(schoolId).run();

    // Finally remove the school.
    await env.DB.prepare(
      `DELETE FROM schools WHERE id = ?`
    ).bind(schoolId).run();

    return json({
      ok: true,
      message: `${school.name} has been deleted.`
    });

  } catch (error) {
    console.error("Delete school failed:", error);

    return json({
      error: "School could not be deleted."
    }, 500);
  }
}