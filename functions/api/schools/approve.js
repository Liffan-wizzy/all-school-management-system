import {
  getAuthenticatedUser,
  json,
  parseJson
} from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const auth = await getAuthenticatedUser(request, env);

    if (!auth.user) {
      return auth.response;
    }

    if (auth.user.role !== "PLATFORM_ADMIN") {
      return json(
        { error: "Only the Liffan platform administrator can approve schools." },
        403
      );
    }

    const body = await parseJson(request);

    const schoolId = String(body?.school_id || "").trim();

    if (!schoolId) {
      return json(
        { error: "School ID is required." },
        400
      );
    }

    const school = await env.DB
      .prepare(`
        SELECT id, name, status
        FROM schools
        WHERE id = ?
        LIMIT 1
      `)
      .bind(schoolId)
      .first();

    if (!school) {
      return json(
        { error: "School was not found." },
        404
      );
    }

    await env.DB
      .prepare(`
        UPDATE schools
        SET status = 'Active'
        WHERE id = ?
      `)
      .bind(schoolId)
      .run();

    return json({
      ok: true,
      school_id: schoolId,
      school_name: school.name,
      status: "Active",
      message: `${school.name} has been approved.`
    });
  } catch (error) {
    console.error("School approval failed:", error);

    return json(
      { error: "School approval could not be completed." },
      500
    );
  }
}