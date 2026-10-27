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
      return json(
        { error: "Platform administrator access required." },
        403
      );
    }

    const body = await parseJson(request);

    const schoolId = String(
      body?.school_id || ""
    ).trim();

    const plan = String(
      body?.plan || "STANDARD"
    ).trim();

    const paidUntil = String(
      body?.paid_until ||
      body?.expires_at ||
      ""
    ).trim();

    if (!schoolId) {
      return json(
        { error: "Select a school." },
        400
      );
    }

    if (!paidUntil) {
      return json(
        { error: "Select the school expiry date." },
        400
      );
    }

    const parsedExpiry =
      Date.parse(paidUntil);

    if (Number.isNaN(parsedExpiry)) {
      return json(
        { error: "Enter a valid school expiry date." },
        400
      );
    }

    const school = await env.DB.prepare(`
      SELECT id, name
      FROM schools
      WHERE CAST(id AS TEXT) = CAST(? AS TEXT)
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

    /*
     * Check whether this school already has
     * a School Administrator.
     *
     * IMPORTANT:
     * Renewal must NOT recreate the admin
     * or reset their password.
     */
    const existingAdmin =
      await env.DB.prepare(`
        SELECT
          id,
          email,
          full_name
        FROM auth_users
        WHERE CAST(school_id AS TEXT) = CAST(? AS TEXT)
          AND role = 'SCHOOL_ADMIN'
        LIMIT 1
      `)
        .bind(schoolId)
        .first();

    /*
     * Only require administrator details
     * during FIRST activation.
     */
    if (!existingAdmin) {
      const adminName = String(
        body?.admin_name ||
        body?.full_name ||
        ""
      ).trim();

      const adminEmail = String(
        body?.admin_email ||
        body?.email ||
        ""
      )
        .trim()
        .toLowerCase();

      const adminPassword = String(
        body?.admin_password ||
        body?.password ||
        ""
      );

      if (
        !adminName ||
        !adminEmail ||
        !adminPassword
      ) {
        return json({
          error:
            "This school has no School Administrator yet. " +
            "Administrator name, email and password are required for first activation."
        }, 400);
      }

      if (adminPassword.length < 12) {
        return json({
          error:
            "School administrator password must be at least 12 characters."
        }, 400);
      }

      const emailOwner =
        await env.DB.prepare(`
          SELECT id, school_id
          FROM auth_users
          WHERE email = ? COLLATE NOCASE
          LIMIT 1
        `)
          .bind(adminEmail)
          .first();

      if (emailOwner) {
        return json({
          error:
            "That email already belongs to another account."
        }, 409);
      }

      const adminId =
        randomId();

      const { salt, hash } =
        await hashPassword(
          adminPassword
        );

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
        VALUES (
          ?, ?, ?, ?,
          'SCHOOL_ADMIN',
          ?, ?, 1
        )
      `)
        .bind(
          adminId,
          schoolId,
          adminName,
          adminEmail,
          salt,
          hash
        )
        .run();
    }

    /*
     * Activate the school itself.
     */
    await env.DB.prepare(`
      UPDATE schools
      SET status = 'Active'
      WHERE CAST(id AS TEXT) = CAST(? AS TEXT)
    `)
      .bind(schoolId)
      .run();

    /*
     * CRITICAL:
     * One access record per school.
     *
     * If it already exists, replace the
     * old expiry with the newly approved
     * expiry and restore ACTIVE status.
     */
    await env.DB.prepare(`
      INSERT INTO school_access (
        school_id,
        status,
        plan,
        paid_until,
        updated_at
      )
      VALUES (
        ?,
        'ACTIVE',
        ?,
        ?,
        CURRENT_TIMESTAMP
      )

      ON CONFLICT(school_id)
      DO UPDATE SET
        status = 'ACTIVE',
        plan = excluded.plan,
        paid_until = excluded.paid_until,
        updated_at = CURRENT_TIMESTAMP
    `)
      .bind(
        schoolId,
        plan,
        paidUntil
      )
      .run();

    /*
     * Ensure the existing School Admin
     * remains active without touching
     * their password.
     */
    await env.DB.prepare(`
      UPDATE auth_users
      SET active = 1
      WHERE CAST(school_id AS TEXT) = CAST(? AS TEXT)
        AND role = 'SCHOOL_ADMIN'
    `)
      .bind(schoolId)
      .run();

    /*
     * Read back what D1 actually saved.
     * This lets us immediately detect
     * renewal/storage problems.
     */
    const savedAccess =
      await env.DB.prepare(`
        SELECT
          school_id,
          status,
          plan,
          paid_until,
          updated_at
        FROM school_access
        WHERE CAST(school_id AS TEXT) = CAST(? AS TEXT)
        LIMIT 1
      `)
        .bind(schoolId)
        .first();

    if (!savedAccess) {
      return json({
        error:
          "School access was not saved."
      }, 500);
    }

    return json({
      ok: true,

      school_id:
        schoolId,

      school_name:
        school.name,

      status:
        savedAccess.status,

      plan:
        savedAccess.plan,

      paid_until:
        savedAccess.paid_until,

      updated_at:
        savedAccess.updated_at,

      existing_admin:
        Boolean(existingAdmin),

      message:
        `${school.name} access updated successfully until ` +
        `${savedAccess.paid_until}.`
    });

  } catch (error) {
    console.error(
      "School approval failed:",
      error
    );

    return json({
      error:
        error?.message ||
        "School approval could not be completed."
    }, 500);
  }
}