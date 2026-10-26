import {
  json,
  requireRole,
  parseJson,
  randomId,
  getTableInfo,
  pickColumn,
  quoteIdentifier
} from '../../_lib/auth.js';

const SCHOOL_ROLES = [
  'SECRETARY',
  'FINANCE_OFFICE',
  'TEACHER',
  'PARENT'
];

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireRole(request, env, [
      'PLATFORM_ADMIN',
      'SCHOOL_ADMIN'
    ]);

    if (!auth.user) return auth.response;

    const url = new URL(request.url);
    const status = String(
      url.searchParams.get('status') || 'PENDING'
    ).toUpperCase();

    if (!['PENDING', 'APPROVED', 'REJECTED', 'ALL'].includes(status)) {
      return json({ error: 'Invalid status filter.' }, 400);
    }

    let sql = `
      SELECT
        id,
        school_id,
        full_name,
        email,
        role,
        student_ref,
        status,
        created_at,
        reviewed_at
      FROM auth_registration_requests
    `;

    const clauses = [];
    const params = [];

    // School Admin sees ONLY their own school's requests.
    if (auth.user.role === 'SCHOOL_ADMIN') {
      clauses.push('CAST(school_id AS TEXT) = ?');
      params.push(String(auth.user.school_id));
    }

    if (status !== 'ALL') {
      clauses.push('status = ?');
      params.push(status);
    }

    if (clauses.length) {
      sql += ` WHERE ${clauses.join(' AND ')}`;
    }

    sql += ' ORDER BY created_at DESC LIMIT 200';

    const result = await env.DB.prepare(sql)
      .bind(...params)
      .all();

    return json({
      ok: true,
      requests: result.results || []
    });

  } catch (error) {
    console.error('Registration request list failed:', error);

    return json({
      error: 'Could not load registration requests.'
    }, 500);
  }
}


export async function onRequestPost({ request, env }) {
  try {
    // Staff approval belongs to the School Admin.
    const auth = await requireRole(request, env, ['SCHOOL_ADMIN']);

    if (!auth.user) return auth.response;

    const body = await parseJson(request);

    const requestId = String(
      body?.request_id || ''
    ).trim();

    const decision = String(
      body?.decision || ''
    ).trim().toUpperCase();

    if (
      !requestId ||
      !['APPROVE', 'REJECT'].includes(decision)
    ) {
      return json({
        error: 'Provide request_id and decision APPROVE or REJECT.'
      }, 400);
    }

    const item = await env.DB.prepare(`
      SELECT
        id,
        school_id,
        full_name,
        email,
        role,
        password_salt,
        password_hash,
        student_ref,
        status
      FROM auth_registration_requests
      WHERE id = ?
      LIMIT 1
    `)
      .bind(requestId)
      .first();

    if (!item) {
      return json({
        error: 'Registration request not found.'
      }, 404);
    }

    if (item.status !== 'PENDING') {
      return json({
        error: 'This request has already been reviewed.'
      }, 409);
    }

    // Critical tenant protection:
    // School Admin can manage ONLY their school.
    if (
      String(item.school_id) !==
      String(auth.user.school_id)
    ) {
      return json({
        error: 'You can review users for your own school only.'
      }, 403);
    }

    // Prevent unexpected roles from being created.
    if (!SCHOOL_ROLES.includes(String(item.role).toUpperCase())) {
      return json({
        error: 'This role cannot be approved by a school administrator.'
      }, 400);
    }


    // =====================================================
    // REJECT REQUEST
    // =====================================================

    if (decision === 'REJECT') {
      await env.DB.prepare(`
        UPDATE auth_registration_requests
        SET
          status = 'REJECTED',
          reviewed_by = ?,
          reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND status = 'PENDING'
      `)
        .bind(auth.user.id, requestId)
        .run();

      return json({
        ok: true,
        message: 'Registration request rejected.'
      });
    }


    // =====================================================
    // APPROVE REQUEST
    // =====================================================

    const existing = await env.DB.prepare(`
      SELECT id
      FROM auth_users
      WHERE email = ? COLLATE NOCASE
      LIMIT 1
    `)
      .bind(item.email)
      .first();

    if (existing) {
      return json({
        error: 'This email already has an account.'
      }, 409);
    }


    // =====================================================
    // PARENT → CHILD LINK
    // =====================================================

    let studentId = null;

    if (item.role === 'PARENT') {
      const studentColumns =
        await getTableInfo(env.DB, 'students');

      const idCol = pickColumn(
        studentColumns,
        ['id', 'student_id']
      );

      const schoolCol = pickColumn(
        studentColumns,
        ['school_id']
      );

      const admissionCol = pickColumn(
        studentColumns,
        [
          'admission_no',
          'admission_number',
          'admission_code'
        ]
      );

      if (!idCol || !schoolCol || !admissionCol) {
        return json({
          error:
            'Parent linking requires student ID, school ID and admission number.'
        }, 500);
      }

      const found = await env.DB.prepare(`
        SELECT
          CAST(${quoteIdentifier(idCol)} AS TEXT) AS id
        FROM students
        WHERE
          CAST(${quoteIdentifier(schoolCol)} AS TEXT) = ?
          AND lower(
            CAST(${quoteIdentifier(admissionCol)} AS TEXT)
          ) = lower(?)
        LIMIT 1
      `)
        .bind(
          String(item.school_id),
          String(item.student_ref || '')
        )
        .first();

      if (!found) {
        return json({
          error:
            'The child admission number was not found in this school.'
        }, 400);
      }

      studentId = String(found.id);
    }


    // =====================================================
    // CREATE USER
    // =====================================================

    const newUserId = randomId();

    const statements = [
      env.DB.prepare(`
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
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `)
        .bind(
          newUserId,
          String(item.school_id),
          item.full_name,
          item.email,
          item.role,
          item.password_salt,
          item.password_hash
        )
    ];


    // Parent gets linked only to the verified child.
    if (item.role === 'PARENT') {
      statements.push(
        env.DB.prepare(`
          INSERT INTO auth_parent_students (
            id,
            parent_user_id,
            school_id,
            student_id,
            linked_by
          )
          VALUES (?, ?, ?, ?, ?)
        `)
          .bind(
            randomId(),
            newUserId,
            String(item.school_id),
            studentId,
            auth.user.id
          )
      );
    }


    statements.push(
      env.DB.prepare(`
        UPDATE auth_registration_requests
        SET
          status = 'APPROVED',
          reviewed_by = ?,
          reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND status = 'PENDING'
      `)
        .bind(
          auth.user.id,
          requestId
        )
    );


    await env.DB.batch(statements);


    return json({
      ok: true,
      message: `${item.role} account approved successfully.`,
      user: {
        id: newUserId,
        school_id: item.school_id,
        full_name: item.full_name,
        email: item.email,
        role: item.role
      }
    }, 201);

  } catch (error) {
    console.error(
      'Registration review failed:',
      error
    );

    return json({
      error:
        'Registration review could not be completed.'
    }, 500);
  }
}