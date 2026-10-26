import {
  json,
  requireRole,
  parseJson,
  randomId
} from "../_lib/auth.js";


const EDIT_ROLES = [
  "SCHOOL_ADMIN",
  "SECRETARY"
];


export async function onRequestGet({ request, env }) {
  try {

    const auth = await requireRole(request, env, [
      "SCHOOL_ADMIN",
      "SECRETARY",
      "FINANCE_OFFICE",
      "TEACHER",
      "PARENT"
    ]);

    if (!auth.user) return auth.response;

    const schoolId = String(auth.user.school_id || "");

    if (!schoolId) {
      return json({ error: "No school is assigned to this account." }, 400);
    }


    const school = await env.DB.prepare(`
      SELECT
        id,
        name,
        school_type,
        location,
        logo_url,
        motto,
        phone,
        email,
        website,
        description,
        status
      FROM schools
      WHERE CAST(id AS TEXT) = ?
      LIMIT 1
    `)
      .bind(schoolId)
      .first();


    if (!school) {
      return json({ error: "School not found." }, 404);
    }


    const photos = await env.DB.prepare(`
      SELECT
        id,
        photo_url,
        caption,
        created_at
      FROM school_photos
      WHERE CAST(school_id AS TEXT) = ?
      ORDER BY created_at DESC
      LIMIT 30
    `)
      .bind(schoolId)
      .all();


    return json({
      ok: true,
      school,
      photos: photos.results || [],
      can_edit: EDIT_ROLES.includes(auth.user.role)
    });

  } catch (error) {

    console.error("School profile load failed:", error);

    return json({
      error: "Unable to load school profile."
    }, 500);

  }
}


export async function onRequestPost({ request, env }) {
  try {

    const auth = await requireRole(
      request,
      env,
      EDIT_ROLES
    );

    if (!auth.user) return auth.response;


    const schoolId =
      String(auth.user.school_id || "");

    if (!schoolId) {
      return json({
        error: "No school is assigned to this account."
      }, 400);
    }


    const body = await parseJson(request);

    const action =
      String(body?.action || "UPDATE_PROFILE")
        .trim()
        .toUpperCase();


    /*
     * UPDATE SCHOOL PROFILE
     */
    if (action === "UPDATE_PROFILE") {

      const name =
        String(body?.name || "").trim();

      const schoolType =
        String(body?.school_type || "School").trim();

      const location =
        String(body?.location || "").trim();

      const motto =
        String(body?.motto || "").trim();

      const phone =
        String(body?.phone || "").trim();

      const email =
        String(body?.email || "").trim();

      const website =
        String(body?.website || "").trim();

      const description =
        String(body?.description || "").trim();

      const logoUrl =
        String(body?.logo_url || "").trim();


      if (!name) {
        return json({
          error: "School name is required."
        }, 400);
      }


      await env.DB.prepare(`
        UPDATE schools
        SET
          name = ?,
          school_type = ?,
          location = ?,
          motto = ?,
          phone = ?,
          email = ?,
          website = ?,
          description = ?,
          logo_url = ?
        WHERE CAST(id AS TEXT) = ?
      `)
        .bind(
          name,
          schoolType,
          location || null,
          motto || null,
          phone || null,
          email || null,
          website || null,
          description || null,
          logoUrl || null,
          schoolId
        )
        .run();


      return json({
        ok: true,
        message: "School profile updated successfully."
      });

    }


    /*
     * ADD SCHOOL PHOTO
     */
    if (action === "ADD_PHOTO") {

      const photoUrl =
        String(body?.photo_url || "").trim();

      const caption =
        String(body?.caption || "").trim();


      if (!photoUrl) {
        return json({
          error: "Photo URL is required."
        }, 400);
      }


      const id = randomId();


      await env.DB.prepare(`
        INSERT INTO school_photos (
          id,
          school_id,
          photo_url,
          caption,
          uploaded_by
        )
        VALUES (?, ?, ?, ?, ?)
      `)
        .bind(
          id,
          schoolId,
          photoUrl,
          caption || null,
          auth.user.id
        )
        .run();


      return json({
        ok: true,
        message: "School photo added successfully.",
        photo_id: id
      }, 201);

    }


    /*
     * DELETE SCHOOL PHOTO
     */
    if (action === "DELETE_PHOTO") {

      const photoId =
        String(body?.photo_id || "").trim();


      if (!photoId) {
        return json({
          error: "Photo ID is required."
        }, 400);
      }


      await env.DB.prepare(`
        DELETE FROM school_photos
        WHERE id = ?
          AND CAST(school_id AS TEXT) = ?
      `)
        .bind(
          photoId,
          schoolId
        )
        .run();


      return json({
        ok: true,
        message: "School photo removed."
      });

    }


    return json({
      error: "Unknown school profile action."
    }, 400);


  } catch (error) {

    console.error("School profile update failed:", error);

    return json({
      error: "School profile could not be updated."
    }, 500);

  }
}