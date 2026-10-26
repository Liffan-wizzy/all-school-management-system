const SESSION_COOKIE = 'liffan_session';
const SESSION_HOURS = 12;
const PBKDF2_ITERATIONS = 100000;

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export function parseJson(request) {
  return request.json().catch(() => null);
}

export function randomId() {
  return crypto.randomUUID();
}

function bytesToBase64Url(bytes) {
  let binary = '';

  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const padded =
    normalized +
    '='.repeat((4 - (normalized.length % 4)) % 4);

  const binary = atob(padded);

  return Uint8Array.from(
    binary,
    (char) => char.charCodeAt(0)
  );
}

export function makeRandomToken(size = 32) {
  return bytesToBase64Url(
    crypto.getRandomValues(
      new Uint8Array(size)
    )
  );
}

export async function sha256Base64Url(value) {
  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(value)
    );

  return bytesToBase64Url(
    new Uint8Array(digest)
  );
}

export async function hashPassword(
  password,
  salt = makeRandomToken(16)
) {
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 200
  ) {
    throw new Error(
      'Password must be 12–200 characters long.'
    );
  }

  const key =
    await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

  const bits =
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: base64UrlToBytes(salt),
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      key,
      256
    );

  return {
    salt,
    hash: bytesToBase64Url(
      new Uint8Array(bits)
    ),
  };
}

export async function verifyPassword(
  password,
  salt,
  expectedHash
) {
  try {
    const result =
      await hashPassword(password, salt);

    const left =
      new TextEncoder().encode(
        result.hash
      );

    const right =
      new TextEncoder().encode(
        expectedHash || ''
      );

    if (left.length !== right.length) {
      return false;
    }

    let diff = 0;

    for (
      let i = 0;
      i < left.length;
      i += 1
    ) {
      diff |= left[i] ^ right[i];
    }

    return diff === 0;
  } catch {
    return false;
  }
}

export function getCookie(request, name) {
  const header =
    request.headers.get('Cookie') || '';

  for (const part of header.split(';')) {
    const index = part.indexOf('=');

    if (index < 0) continue;

    if (
      part.slice(0, index).trim() === name
    ) {
      return part
        .slice(index + 1)
        .trim();
    }
  }

  return null;
}

export function sessionCookie(
  request,
  token,
  maxAgeSeconds =
    SESSION_HOURS * 60 * 60
) {
  const secure =
    new URL(request.url).protocol ===
    'https:'
      ? '; Secure'
      : '';

  return (
    `${SESSION_COOKIE}=${token}; ` +
    `HttpOnly; SameSite=Lax; Path=/; ` +
    `Max-Age=${maxAgeSeconds}${secure}`
  );
}

export async function createSession(
  request,
  env,
  userId
) {
  const token =
    makeRandomToken(32);

  const tokenHash =
    await sha256Base64Url(token);

  /*
   * Store a standard ISO timestamp.
   * Example:
   * 2026-10-27T05:00:00.000Z
   */
  const expiresAt =
    new Date(
      Date.now() +
        SESSION_HOURS *
          60 *
          60 *
          1000
    ).toISOString();

  await env.DB.prepare(`
    INSERT INTO auth_sessions (
      id,
      user_id,
      token_hash,
      expires_at
    )
    VALUES (?, ?, ?, ?)
  `)
    .bind(
      randomId(),
      userId,
      tokenHash,
      expiresAt
    )
    .run();

  return sessionCookie(
    request,
    token
  );
}

function parseStoredDate(value) {
  if (!value) {
    return NaN;
  }

  const raw =
    String(value).trim();

  /*
   * ISO timestamps already contain T.
   */
  if (raw.includes('T')) {
    return Date.parse(raw);
  }

  /*
   * SQLite timestamps may look like:
   * 2026-10-27 05:00:00
   *
   * Treat them as UTC.
   */
  return Date.parse(
    raw.replace(' ', 'T') + 'Z'
  );
}

function expiryIsValid(value) {
  /*
   * No expiry means the Platform
   * Administrator has left the
   * school active manually.
   */
  if (!value) {
    return true;
  }

  const raw =
    String(value).trim();

  /*
   * Date-only paid_until values remain
   * valid through the end of that date.
   */
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(raw)
  ) {
    const parsed =
      Date.parse(
        `${raw}T23:59:59.999Z`
      );

    return (
      Number.isFinite(parsed) &&
      parsed >= Date.now()
    );
  }

  const parsed =
    parseStoredDate(raw);

  return (
    Number.isFinite(parsed) &&
    parsed >= Date.now()
  );
}

export async function getAuthenticatedUser(
  request,
  env
) {
  const token =
    getCookie(
      request,
      SESSION_COOKIE
    );

  if (!token) {
    return {
      user: null,
      response: json(
        {
          error:
            'Sign in required.',
        },
        401
      ),
    };
  }

  const tokenHash =
    await sha256Base64Url(token);

  const row =
    await env.DB.prepare(`
      SELECT
        u.id,
        u.school_id,
        u.full_name,
        u.email,
        u.role,
        u.active,
        s.expires_at
          AS session_expires_at
      FROM auth_sessions s
      JOIN auth_users u
        ON u.id = s.user_id
      WHERE s.token_hash = ?
      LIMIT 1
    `)
      .bind(tokenHash)
      .first();

  if (!row) {
    return {
      user: null,
      response: json(
        {
          error:
            'Your session was not found. Please sign in again.',
        },
        401
      ),
    };
  }

  if (!row.active) {
    return {
      user: null,
      response: json(
        {
          error:
            'This account is inactive.',
        },
        403
      ),
    };
  }

  const sessionExpiry =
    parseStoredDate(
      row.session_expires_at
    );

  if (
    !Number.isFinite(
      sessionExpiry
    ) ||
    sessionExpiry <= Date.now()
  ) {
    return {
      user: null,
      response: json(
        {
          error:
            'Your session has expired. Please sign in again.',
        },
        401
      ),
    };
  }

  /*
   * Platform Administrator is not
   * attached to an individual school.
   */
  if (
    row.role ===
    'PLATFORM_ADMIN'
  ) {
    return {
      user: {
        id: row.id,
        school_id: null,
        full_name:
          row.full_name,
        email: row.email,
        role: row.role,
      },
      response: null,
    };
  }

  /*
   * Every other account must belong
   * to a school.
   */
  if (!row.school_id) {
    return {
      user: null,
      response: json(
        {
          error:
            'This account is not assigned to a school.',
        },
        403
      ),
    };
  }

  /*
   * Platform Administrator validation
   * controls school access.
   */
  const access =
    await env.DB.prepare(`
      SELECT
        status,
        plan,
        paid_until
      FROM school_access
      WHERE CAST(school_id AS TEXT) = ?
      LIMIT 1
    `)
      .bind(
        String(row.school_id)
      )
      .first();

  if (!access) {
    return {
      user: null,
      response: json(
        {
          error:
            'This school has not been activated by Liffan.',
        },
        403
      ),
    };
  }

  if (
    String(
      access.status || ''
    ).toUpperCase() !==
    'ACTIVE'
  ) {
    return {
      user: null,
      response: json(
        {
          error:
            'This school is suspended or awaiting activation.',
        },
        403
      ),
    };
  }

  if (
    !expiryIsValid(
      access.paid_until
    )
  ) {
    return {
      user: null,
      response: json(
        {
          error:
            'This school access period has expired. Contact Liffan administration.',
        },
        403
      ),
    };
  }

  return {
    user: {
      id: row.id,
      school_id:
        row.school_id,
      full_name:
        row.full_name,
      email: row.email,
      role: row.role,
    },
    response: null,
  };
}

export async function requireRole(
  request,
  env,
  allowedRoles
) {
  const auth =
    await getAuthenticatedUser(
      request,
      env
    );

  if (!auth.user) {
    return {
      user: null,
      response:
        auth.response,
    };
  }

  if (
    !allowedRoles.includes(
      auth.user.role
    )
  ) {
    return {
      user: null,
      response: json(
        {
          error:
            'You do not have permission to perform this action.',
        },
        403
      ),
    };
  }

  return {
    user: auth.user,
    response: null,
  };
}

export async function logoutResponse(
  request,
  env
) {
  const token =
    getCookie(
      request,
      SESSION_COOKIE
    );

  if (token) {
    const hash =
      await sha256Base64Url(
        token
      );

    await env.DB.prepare(`
      DELETE FROM auth_sessions
      WHERE token_hash = ?
    `)
      .bind(hash)
      .run();
  }

  return json(
    { ok: true },
    200,
    {
      'Set-Cookie':
        sessionCookie(
          request,
          '',
          0
        ),
    }
  );
}

export async function getTableInfo(
  db,
  tableName
) {
  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(
      tableName
    )
  ) {
    throw new Error(
      'Invalid table name.'
    );
  }

  const result =
    await db.prepare(
      `PRAGMA table_info("${tableName}")`
    ).all();

  return result.results || [];
}

export function quoteIdentifier(
  name
) {
  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(
      name
    )
  ) {
    throw new Error(
      'Invalid SQL identifier.'
    );
  }

  return `"${name}"`;
}

export function pickColumn(
  columns,
  candidates
) {
  const byLower =
    new Map(
      columns.map(
        (column) => [
          String(
            column.name
          ).toLowerCase(),
          column.name,
        ]
      )
    );

  for (
    const candidate
    of candidates
  ) {
    const match =
      byLower.get(
        candidate.toLowerCase()
      );

    if (match) {
      return match;
    }
  }

  return null;
}