import {
  getAuthenticatedUser,
  json,
  parseJson,
  randomId
} from "../_lib/auth.js";

/*
  POST /api/schools
  Public school application.

  GET /api/schools
  PLATFORM_ADMIN only.
*/

export async function onRequestPost({ request, env }) {
  try {
    const body = await parseJson(request);

    const name = String(body?.name || body?.school_name || "").trim();
    const schoolType = String(body?.school_type || "School").trim();
    const location = String(body?.location || "").trim();
    const logoUrl = String(body?.logo_url || "").trim();

    if (name.length < 2 || name.length > 150) {
      return json(
        { error: "Enter a valid school name." },
        400
      );
    }

    if (schoolType.length > 100) {
      return json(
        { error: "School type is too long." },
        400
      );
    }

    if (location.length > 200) {
      return json(
        { error: "Location is too long." },
        400
      );
    }

    const existing = await env.DB
      .prepare(`
        SELECT id
        FROM schools
        WHERE name = ? COLLATE NOCASE
        LIMIT 1
      `)
      .bind(name)
      .first();

    if (existing) {
      return json(
        {
          error:
            "A school with this name already exists or has already applied."
        },
        409
      );
    }

    const schoolId = randomId();

    await env.DB
      .prepare(`
        INSERT INTO schools (
          id,
          name,
          school_type,
          location,
          logo_url,
          status
        )
        VALUES (?, ?, ?, ?, ?, 'Pending')
      `)
      .bind(
        schoolId,
        name,
        schoolType || "School",
        location || null,
        logoUrl || null
      )
      .run();

    return json(
      {
        ok: true,
        school_id: schoolId,
        status: "Pending",
        message:
          "School application received. Liffan will activate the school after approval."
      },
      201
    );
  } catch (error) {
    console.error("School registration failed:", error);

    return json(
      {
        error:
          "School registration could not be completed."
      },
      500
    );
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await getAuthenticatedUser(request, env);

    if (!auth.user) {
      return auth.response;
    }

    if (auth.user.role !== "PLATFORM_ADMIN") {
      return json(
        { error: "Platform administrator access required." },
        403
      );
    }

   const result = await env.DB.prepare(`
  SELECT
    s.id,
    s.name,
    s.school_type,
    s.location,
    s.logo_url,
    s.status,
    s.created_at,
    sa.plan,
    sa.paid_until,
    sa.status AS access_status,
    COUNT(DISTINCT st.id) AS student_count
  FROM schools s

  LEFT JOIN school_access sa
    ON CAST(sa.school_id AS TEXT) = CAST(s.id AS TEXT)

  LEFT JOIN students st
    ON CAST(st.school_id AS TEXT) = CAST(s.id AS TEXT)

  GROUP BY
    s.id,
    s.name,
    s.school_type,
    s.location,
    s.logo_url,
    s.status,
    s.created_at,
    sa.plan,
    sa.paid_until,
    sa.status

  ORDER BY s.created_at DESC
`).all();
    return json({
      ok: true,
      schools: result.results || []
    });
  } catch (error) {
    console.error("School list failed:", error);

    return json(
      { error: "Schools could not be loaded." },
      500
    );
  }
}
