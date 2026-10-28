var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// _lib/auth.js
var SESSION_COOKIE = "liffan_session";
var SESSION_HOURS = 12;
var PBKDF2_ITERATIONS = 1e5;
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}
__name(json, "json");
function parseJson(request) {
  return request.json().catch(() => null);
}
__name(parseJson, "parseJson");
function randomId() {
  return crypto.randomUUID();
}
__name(randomId, "randomId");
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(bytesToBase64Url, "bytesToBase64Url");
function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(
    binary,
    (char) => char.charCodeAt(0)
  );
}
__name(base64UrlToBytes, "base64UrlToBytes");
function makeRandomToken(size = 32) {
  return bytesToBase64Url(
    crypto.getRandomValues(
      new Uint8Array(size)
    )
  );
}
__name(makeRandomToken, "makeRandomToken");
async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return bytesToBase64Url(
    new Uint8Array(digest)
  );
}
__name(sha256Base64Url, "sha256Base64Url");
async function hashPassword(password, salt = makeRandomToken(16)) {
  if (typeof password !== "string" || password.length < 12 || password.length > 200) {
    throw new Error(
      "Password must be 12\u2013200 characters long."
    );
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: base64UrlToBytes(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    key,
    256
  );
  return {
    salt,
    hash: bytesToBase64Url(
      new Uint8Array(bits)
    )
  };
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, salt, expectedHash) {
  try {
    const result = await hashPassword(password, salt);
    const left = new TextEncoder().encode(result.hash);
    const right = new TextEncoder().encode(
      expectedHash || ""
    );
    if (left.length !== right.length) {
      return false;
    }
    let diff = 0;
    for (let i = 0; i < left.length; i += 1) {
      diff |= left[i] ^ right[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}
__name(verifyPassword, "verifyPassword");
function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      return part.slice(index + 1).trim();
    }
  }
  return null;
}
__name(getCookie, "getCookie");
function sessionCookie(request, token, maxAgeSeconds = SESSION_HOURS * 60 * 60) {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}
__name(sessionCookie, "sessionCookie");
async function createSession(request, env, userId) {
  const token = makeRandomToken(32);
  const tokenHash = await sha256Base64Url(token);
  const expiresAt = new Date(
    Date.now() + SESSION_HOURS * 60 * 60 * 1e3
  ).toISOString();
  await env.DB.prepare(`
    INSERT INTO auth_sessions (
      id,
      user_id,
      token_hash,
      expires_at
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    randomId(),
    userId,
    tokenHash,
    expiresAt
  ).run();
  return sessionCookie(
    request,
    token
  );
}
__name(createSession, "createSession");
function parseStoredDate(value) {
  if (!value) return NaN;
  const raw = String(value).trim();
  if (raw.includes("T")) {
    return Date.parse(raw);
  }
  return Date.parse(
    raw.replace(" ", "T") + "Z"
  );
}
__name(parseStoredDate, "parseStoredDate");
function expiryIsValid(value) {
  if (!value) return true;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed2 = Date.parse(
      `${raw}T23:59:59.999Z`
    );
    return Number.isFinite(parsed2) && parsed2 >= Date.now();
  }
  const parsed = parseStoredDate(raw);
  return Number.isFinite(parsed) && parsed >= Date.now();
}
__name(expiryIsValid, "expiryIsValid");
async function getAuthenticatedUser(request, env) {
  const token = getCookie(
    request,
    SESSION_COOKIE
  );
  if (!token) {
    return {
      user: null,
      response: json(
        {
          error: "Sign in required."
        },
        401
      )
    };
  }
  const tokenHash = await sha256Base64Url(token);
  const row = await env.DB.prepare(`
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
    `).bind(tokenHash).first();
  if (!row) {
    return {
      user: null,
      response: json(
        {
          error: "Your session was not found. Please sign in again."
        },
        401
      )
    };
  }
  if (!row.active) {
    return {
      user: null,
      response: json(
        {
          error: "This account is inactive."
        },
        403
      )
    };
  }
  const sessionExpiry = new Date(
    String(row.session_expires_at)
  ).getTime();
  if (Number.isNaN(sessionExpiry) || sessionExpiry <= Date.now()) {
    return {
      user: null,
      response: json(
        {
          error: "Your session has expired. Please sign in again."
        },
        401
      )
    };
  }
  if (row.role === "PLATFORM_ADMIN") {
    return {
      user: {
        id: row.id,
        school_id: null,
        full_name: row.full_name,
        email: row.email,
        role: row.role,
        school_access: {
          status: "PLATFORM",
          active: true,
          plan: null,
          paid_until: null
        }
      },
      response: null
    };
  }
  if (!row.school_id) {
    return {
      user: null,
      response: json(
        {
          error: "This account is not assigned to a school."
        },
        403
      )
    };
  }
  const access = await env.DB.prepare(`
      SELECT
        status,
        plan,
        paid_until
      FROM school_access
      WHERE CAST(school_id AS TEXT) = ?
      LIMIT 1
    `).bind(
    String(row.school_id)
  ).first();
  let accessStatus = "NOT_ACTIVATED";
  let accessActive = false;
  let plan = null;
  let paidUntil = null;
  if (access) {
    plan = access.plan || null;
    paidUntil = access.paid_until || null;
    const storedStatus = String(
      access.status || ""
    ).toUpperCase();
    if (storedStatus === "ACTIVE") {
      if (expiryIsValid(
        access.paid_until
      )) {
        accessStatus = "ACTIVE";
        accessActive = true;
      } else {
        accessStatus = "EXPIRED";
      }
    } else if (storedStatus === "TESTING") {
      if (expiryIsValid(
        access.paid_until
      )) {
        accessStatus = "TESTING";
        accessActive = true;
      } else {
        accessStatus = "EXPIRED";
      }
    } else if (storedStatus === "SUSPENDED") {
      accessStatus = "SUSPENDED";
    } else if (storedStatus === "CANCELLED") {
      accessStatus = "CANCELLED";
    } else {
      accessStatus = storedStatus || "NOT_ACTIVATED";
    }
  }
  return {
    user: {
      id: row.id,
      school_id: row.school_id,
      full_name: row.full_name,
      email: row.email,
      role: row.role,
      school_access: {
        status: accessStatus,
        active: accessActive,
        plan,
        paid_until: paidUntil
      }
    },
    response: null
  };
}
__name(getAuthenticatedUser, "getAuthenticatedUser");
async function requireRole(request, env, allowedRoles) {
  const auth = await getAuthenticatedUser(
    request,
    env
  );
  if (!auth.user) {
    return {
      user: null,
      response: auth.response
    };
  }
  if (!allowedRoles.includes(
    auth.user.role
  )) {
    return {
      user: null,
      response: json(
        {
          error: "You do not have permission to perform this action."
        },
        403
      )
    };
  }
  return {
    user: auth.user,
    response: null
  };
}
__name(requireRole, "requireRole");
async function getTableInfo(db, tableName) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(
    tableName
  )) {
    throw new Error(
      "Invalid table name."
    );
  }
  const result = await db.prepare(
    `PRAGMA table_info("${tableName}")`
  ).all();
  return result.results || [];
}
__name(getTableInfo, "getTableInfo");
function quoteIdentifier(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(
    name
  )) {
    throw new Error(
      "Invalid SQL identifier."
    );
  }
  return `"${name}"`;
}
__name(quoteIdentifier, "quoteIdentifier");
function pickColumn(columns, candidates) {
  const byLower = new Map(
    columns.map(
      (column) => [
        String(
          column.name
        ).toLowerCase(),
        column.name
      ]
    )
  );
  for (const candidate of candidates) {
    const match2 = byLower.get(
      candidate.toLowerCase()
    );
    if (match2) {
      return match2;
    }
  }
  return null;
}
__name(pickColumn, "pickColumn");

// _lib/workflows.js
async function studentShape(db) {
  const columns = await getTableInfo(db, "students");
  const id = pickColumn(columns, ["id", "student_id"]);
  const school = pickColumn(columns, ["school_id"]);
  const name = pickColumn(columns, ["full_name", "name", "student_name"]);
  const admission = pickColumn(columns, ["admission_no", "admission_number", "admission_code"]);
  const className = pickColumn(columns, ["class_name", "class", "grade", "form"]);
  if (!id || !school || !name) throw new Error("students must have an ID, school_id and name column");
  return { columns, id, school, name, admission, className };
}
__name(studentShape, "studentShape");
async function findStudent(db, studentId, schoolId) {
  const shape = await studentShape(db);
  const classSql = shape.className ? `, ${quoteIdentifier(shape.className)} AS class_name` : ", NULL AS class_name";
  const admissionSql = shape.admission ? `, ${quoteIdentifier(shape.admission)} AS admission_no` : ", NULL AS admission_no";
  return db.prepare(`SELECT CAST(${quoteIdentifier(shape.id)} AS TEXT) AS id,
    ${quoteIdentifier(shape.name)} AS full_name${classSql}${admissionSql}
    FROM students WHERE CAST(${quoteIdentifier(shape.id)} AS TEXT) = ?
      AND CAST(${quoteIdentifier(shape.school)} AS TEXT) = ? LIMIT 1`).bind(String(studentId), String(schoolId)).first();
}
__name(findStudent, "findStudent");
async function parentCanSeeStudent(db, user, studentId) {
  if (user.role !== "PARENT") return true;
  const row = await db.prepare(`SELECT 1 AS ok FROM auth_parent_students
    WHERE parent_user_id = ? AND CAST(school_id AS TEXT) = ? AND CAST(student_id AS TEXT) = ? LIMIT 1`).bind(user.id, String(user.school_id), String(studentId)).first();
  return Boolean(row);
}
__name(parentCanSeeStudent, "parentCanSeeStudent");
async function teacherHasAssignment(db, user, subjectId, className, permission = "can_mark") {
  if (user.role !== "TEACHER") return true;
  const permittedColumn = permission === "can_attend" ? "can_attend" : "can_mark";
  const row = await db.prepare(`SELECT 1 AS ok FROM auth_teacher_assignments
    WHERE teacher_user_id = ? AND CAST(school_id AS TEXT) = ? AND subject_id = ?
      AND class_name = ? AND ${permittedColumn} = 1 LIMIT 1`).bind(user.id, String(user.school_id), String(subjectId), String(className || "")).first();
  return Boolean(row);
}
__name(teacherHasAssignment, "teacherHasAssignment");
async function writeAudit(db, user, schoolId, action, entityType, entityId = "", details = {}) {
  await db.prepare(`INSERT INTO auth_audit_events
    (id, school_id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
    randomId(),
    schoolId == null ? null : String(schoolId),
    user?.id || null,
    String(action).slice(0, 100),
    String(entityType).slice(0, 100),
    String(entityId).slice(0, 160),
    JSON.stringify(details).slice(0, 2e3)
  ).run();
}
__name(writeAudit, "writeAudit");

// api/auth/accept-invite.js
async function onRequestPost({ request, env }) {
  try {
    const body = await parseJson(request);
    const token = String(body?.invite_code || "").trim();
    const fullName = String(body?.full_name || "").trim();
    const password = body?.password;
    if (!token || fullName.length < 2 || fullName.length > 120 || typeof password !== "string" || password.length < 12 || password.length > 200) return json({ error: "Provide a valid invite_code, full_name, and password of 12\u2013200 characters." }, 400);
    const hash = await sha256Base64Url(token);
    const invite = await env.DB.prepare(`SELECT id, school_id, email, role, student_ref, expires_at, claimed_at FROM auth_invitations WHERE token_hash = ? LIMIT 1`).bind(hash).first();
    if (!invite || invite.claimed_at || Date.parse(invite.expires_at) < Date.now()) return json({ error: "Invitation is invalid, expired or already used." }, 400);
    const access = await env.DB.prepare("SELECT status, paid_until FROM school_access WHERE CAST(school_id AS TEXT) = ? LIMIT 1").bind(String(invite.school_id)).first();
    const expiryRaw = String(access?.paid_until || "");
    const expiry = /^\d{4}-\d{2}-\d{2}$/.test(expiryRaw) ? Date.parse(`${expiryRaw}T23:59:59.999Z`) : Date.parse(expiryRaw);
    if (!access || access.status !== "ACTIVE" || !Number.isFinite(expiry) || expiry < Date.now()) return json({ error: "School access is not active." }, 403);
    const existing = await env.DB.prepare("SELECT id FROM auth_users WHERE email = ? COLLATE NOCASE LIMIT 1").bind(invite.email).first();
    if (existing) return json({ error: "This email already has an account. Contact the school administrator." }, 409);
    let student = null;
    if (invite.role === "PARENT") {
      const shape = await (async () => {
        const cols = await env.DB.prepare('PRAGMA table_info("students")').all();
        const names = new Map((cols.results || []).map((c) => [String(c.name).toLowerCase(), c.name]));
        return { id: names.get("id") || names.get("student_id"), school: names.get("school_id"), admission: names.get("admission_no") || names.get("admission_number") || names.get("admission_code") };
      })();
      if (!shape.id || !shape.school || !shape.admission) return json({ error: "Student schema does not have a recognized admission-number column." }, 500);
      student = await env.DB.prepare(`SELECT CAST(${JSON.stringify(shape.id)} AS TEXT) AS id FROM students WHERE CAST(${JSON.stringify(shape.school)} AS TEXT) = ? AND CAST(${JSON.stringify(shape.admission)} AS TEXT) = ? LIMIT 1`).bind(String(invite.school_id), String(invite.student_ref)).first();
      if (!student) return json({ error: "Child admission number was not found in this school. Contact the school office." }, 404);
    }
    const parts = await hashPassword(password);
    const userId = randomId();
    const statements = [
      env.DB.prepare(`INSERT INTO auth_users (id, school_id, full_name, email, role, password_salt, password_hash, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).bind(userId, String(invite.school_id), fullName, invite.email, invite.role, parts.salt, parts.hash),
      env.DB.prepare("UPDATE auth_invitations SET claimed_at = CURRENT_TIMESTAMP WHERE id = ? AND claimed_at IS NULL").bind(invite.id)
    ];
    if (student) statements.splice(1, 0, env.DB.prepare(`INSERT INTO auth_parent_students (id, parent_user_id, school_id, student_id, linked_by) VALUES (?, ?, ?, ?, ?)`).bind(randomId(), userId, String(invite.school_id), String(student.id), invite.created_by));
    await env.DB.batch(statements);
    await writeAudit(env.DB, { id: userId }, invite.school_id, "INVITATION_ACCEPT", "user", userId, { role: invite.role, email: invite.email });
    return json({ ok: true, user_id: userId, role: invite.role, message: "Invitation accepted. You can now sign in." }, 201);
  } catch (error) {
    console.error("Invite acceptance failed:", error);
    return json({ error: "Could not accept invitation. Verify the database migration and invitation details." }, 500);
  }
}
__name(onRequestPost, "onRequestPost");

// api/auth/admin-reset-password.js
async function onRequestPost2({ request, env }) {
  const auth = await requireRole(request, env, ["PLATFORM_ADMIN", "SCHOOL_ADMIN"]);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const userId = String(body?.user_id || "");
  const password = body?.new_password;
  if (!userId || typeof password !== "string" || password.length < 12 || password.length > 200) return json({ error: "Provide user_id and a new password of 12\u2013200 characters." }, 400);
  const target = await env.DB.prepare("SELECT id, school_id, role FROM auth_users WHERE id = ? LIMIT 1").bind(userId).first();
  if (!target) return json({ error: "User not found." }, 404);
  if (auth.user.role !== "PLATFORM_ADMIN" && (String(target.school_id) !== String(auth.user.school_id) || target.role === "PLATFORM_ADMIN" || target.role === "SCHOOL_ADMIN")) return json({ error: "School admins may reset only non-admin accounts in their own school." }, 403);
  const parts = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare("UPDATE auth_users SET password_salt = ?, password_hash = ? WHERE id = ?").bind(parts.salt, parts.hash, userId),
    env.DB.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(userId)
  ]);
  return json({ ok: true, message: "Password reset. The user must sign in again." });
}
__name(onRequestPost2, "onRequestPost");

// api/auth/login.js
async function onRequestPost3({ request, env }) {
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
    `).bind(email).first();
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
          role: user.role
        }
      },
      200,
      {
        "Set-Cookie": cookie
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
__name(onRequestPost3, "onRequestPost");

// api/auth/me.js
async function onRequestGet({ request, env }) {
  try {
    const auth = await getAuthenticatedUser(request, env);
    if (!auth.user) {
      return auth.response;
    }
    return json({
      ok: true,
      user: auth.user
    });
  } catch (error) {
    console.error("Auth me error:", error);
    return json({
      error: "Unable to load signed-in user."
    }, 500);
  }
}
__name(onRequestGet, "onRequestGet");

// api/auth/register.js
function validPaidUntil(value) {
  if (!value) return false;
  const raw = String(value).trim();
  const expiry = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw);
  return Number.isFinite(expiry) && expiry >= Date.now();
}
__name(validPaidUntil, "validPaidUntil");
async function findSchool(db, requestedId) {
  const columns = await getTableInfo(db, "schools");
  const idCol = pickColumn(columns, ["id", "school_id"]);
  const nameCol = pickColumn(columns, ["name", "school_name", "title"]);
  if (!idCol || !nameCol) throw new Error("The schools table is missing its ID or name column.");
  const row = await db.prepare(`SELECT CAST(${quoteIdentifier(idCol)} AS TEXT) AS id, ${quoteIdentifier(nameCol)} AS name
    FROM schools WHERE CAST(${quoteIdentifier(idCol)} AS TEXT) = ? LIMIT 1`).bind(String(requestedId)).first();
  return row || null;
}
__name(findSchool, "findSchool");
async function onRequestPost4({ request, env }) {
  try {
    const body = await parseJson(request);
    const schoolId = String(body?.school_id || "").trim();
    const fullName = String(body?.full_name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toUpperCase();
    const password = body?.password;
    const studentRef = String(body?.student_ref || "").trim();
    if (!schoolId || fullName.length < 2 || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Choose a school and enter your full name and a valid email." }, 400);
    }
    if (!["SECRETARY", "FINANCE_OFFICE", "TEACHER", "PARENT"].includes(role)) {
      return json({ error: "Public registration is only for secretary, teacher, or parent access. School administrators are appointed by the platform." }, 400);
    }
    if (typeof password !== "string" || password.length < 12 || password.length > 200) {
      return json({ error: "Use a password between 12 and 200 characters." }, 400);
    }
    if (role === "PARENT" && (studentRef.length < 2 || studentRef.length > 100)) {
      return json({ error: "Parents must enter the child\u2019s admission number for school verification." }, 400);
    }
    const school = await findSchool(env.DB, schoolId);
    if (!school) return json({ error: "Selected school was not found." }, 404);
    const access = await env.DB.prepare("SELECT status, paid_until FROM school_access WHERE school_id = ? LIMIT 1").bind(school.id).first();
    if (!access || access.status !== "ACTIVE" || !validPaidUntil(access.paid_until)) {
      return json({ error: "This school is not accepting registrations because its access is pending, suspended, or expired." }, 403);
    }
    const existingAccount = await env.DB.prepare("SELECT id FROM auth_users WHERE email = ? COLLATE NOCASE LIMIT 1").bind(email).first();
    if (existingAccount) return json({ error: "An account already uses this email. Sign in or contact the school administrator." }, 409);
    const existingRequest = await env.DB.prepare("SELECT id FROM auth_registration_requests WHERE email = ? COLLATE NOCASE AND status = 'PENDING' LIMIT 1").bind(email).first();
    if (existingRequest) return json({ error: "A registration request for this email is already waiting for approval." }, 409);
    const passwordParts = await hashPassword(password);
    const id = randomId();
    await env.DB.prepare(`INSERT INTO auth_registration_requests
      (id, school_id, full_name, email, role, password_salt, password_hash, student_ref, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`).bind(id, school.id, fullName, email, role, passwordParts.salt, passwordParts.hash, role === "PARENT" ? studentRef : null).run();
    return json({ ok: true, request_id: id, status: "PENDING", message: "Registration received. Your school must approve it before you can sign in." }, 201);
  } catch (error) {
    console.error("Role registration failed:", error);
    return json({ error: "Registration could not be completed. Confirm the role-registration migration has been applied." }, 500);
  }
}
__name(onRequestPost4, "onRequestPost");

// api/auth/requests.js
var SCHOOL_ROLES = [
  "SECRETARY",
  "FINANCE_OFFICE",
  "TEACHER",
  "PARENT"
];
async function onRequestGet2({ request, env }) {
  try {
    const auth = await requireRole(request, env, [
      "PLATFORM_ADMIN",
      "SCHOOL_ADMIN"
    ]);
    if (!auth.user) return auth.response;
    const url = new URL(request.url);
    const status = String(
      url.searchParams.get("status") || "PENDING"
    ).toUpperCase();
    if (!["PENDING", "APPROVED", "REJECTED", "ALL"].includes(status)) {
      return json({ error: "Invalid status filter." }, 400);
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
    if (auth.user.role === "SCHOOL_ADMIN") {
      clauses.push("CAST(school_id AS TEXT) = ?");
      params.push(String(auth.user.school_id));
    }
    if (status !== "ALL") {
      clauses.push("status = ?");
      params.push(status);
    }
    if (clauses.length) {
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }
    sql += " ORDER BY created_at DESC LIMIT 200";
    const result = await env.DB.prepare(sql).bind(...params).all();
    return json({
      ok: true,
      requests: result.results || []
    });
  } catch (error) {
    console.error("Registration request list failed:", error);
    return json({
      error: "Could not load registration requests."
    }, 500);
  }
}
__name(onRequestGet2, "onRequestGet");
async function onRequestPost5({ request, env }) {
  try {
    const auth = await requireRole(request, env, ["SCHOOL_ADMIN"]);
    if (!auth.user) return auth.response;
    const body = await parseJson(request);
    const requestId = String(
      body?.request_id || ""
    ).trim();
    const decision = String(
      body?.decision || ""
    ).trim().toUpperCase();
    if (!requestId || !["APPROVE", "REJECT"].includes(decision)) {
      return json({
        error: "Provide request_id and decision APPROVE or REJECT."
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
    `).bind(requestId).first();
    if (!item) {
      return json({
        error: "Registration request not found."
      }, 404);
    }
    if (item.status !== "PENDING") {
      return json({
        error: "This request has already been reviewed."
      }, 409);
    }
    if (String(item.school_id) !== String(auth.user.school_id)) {
      return json({
        error: "You can review users for your own school only."
      }, 403);
    }
    if (!SCHOOL_ROLES.includes(String(item.role).toUpperCase())) {
      return json({
        error: "This role cannot be approved by a school administrator."
      }, 400);
    }
    if (decision === "REJECT") {
      await env.DB.prepare(`
        UPDATE auth_registration_requests
        SET
          status = 'REJECTED',
          reviewed_by = ?,
          reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND status = 'PENDING'
      `).bind(auth.user.id, requestId).run();
      return json({
        ok: true,
        message: "Registration request rejected."
      });
    }
    const existing = await env.DB.prepare(`
      SELECT id
      FROM auth_users
      WHERE email = ? COLLATE NOCASE
      LIMIT 1
    `).bind(item.email).first();
    if (existing) {
      return json({
        error: "This email already has an account."
      }, 409);
    }
    let studentId = null;
    if (item.role === "PARENT") {
      const studentColumns = await getTableInfo(env.DB, "students");
      const idCol = pickColumn(
        studentColumns,
        ["id", "student_id"]
      );
      const schoolCol = pickColumn(
        studentColumns,
        ["school_id"]
      );
      const admissionCol = pickColumn(
        studentColumns,
        [
          "admission_no",
          "admission_number",
          "admission_code"
        ]
      );
      if (!idCol || !schoolCol || !admissionCol) {
        return json({
          error: "Parent linking requires student ID, school ID and admission number."
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
      `).bind(
        String(item.school_id),
        String(item.student_ref || "")
      ).first();
      if (!found) {
        return json({
          error: "The child admission number was not found in this school."
        }, 400);
      }
      studentId = String(found.id);
    }
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
      `).bind(
        newUserId,
        String(item.school_id),
        item.full_name,
        item.email,
        item.role,
        item.password_salt,
        item.password_hash
      )
    ];
    if (item.role === "PARENT") {
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
        `).bind(
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
      `).bind(
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
      "Registration review failed:",
      error
    );
    return json({
      error: "Registration review could not be completed."
    }, 500);
  }
}
__name(onRequestPost5, "onRequestPost");

// api/parent/children.js
async function onRequestGet3({ request, env }) {
  try {
    const auth = await getAuthenticatedUser(request, env);
    if (!auth.user) return auth.response;
    if (auth.user.role !== "PARENT") return json({ error: "This endpoint is for parent accounts only." }, 403);
    const columns = await getTableInfo(env.DB, "students");
    const idCol = pickColumn(columns, ["id", "student_id"]);
    const schoolCol = pickColumn(columns, ["school_id"]);
    const nameCol = pickColumn(columns, ["full_name", "name", "student_name"]);
    const admissionCol = pickColumn(columns, ["admission_no", "admission_number", "admission_code"]);
    const classCol = pickColumn(columns, ["class_name", "class", "grade", "form"]);
    const streamCol = pickColumn(columns, ["stream"]);
    const genderCol = pickColumn(columns, ["gender"]);
    if (!idCol || !schoolCol || !nameCol) return json({ error: "Student schema is missing required ID, school_id, or name columns." }, 500);
    const select = [
      `CAST(s.${quoteIdentifier(idCol)} AS TEXT) AS student_id`,
      `s.${quoteIdentifier(nameCol)} AS full_name`,
      admissionCol ? `s.${quoteIdentifier(admissionCol)} AS admission_no` : "NULL AS admission_no",
      classCol ? `s.${quoteIdentifier(classCol)} AS class_name` : "NULL AS class_name",
      streamCol ? `s.${quoteIdentifier(streamCol)} AS stream` : "NULL AS stream",
      genderCol ? `s.${quoteIdentifier(genderCol)} AS gender` : "NULL AS gender"
    ];
    const sql = `SELECT ${select.join(", ")} FROM auth_parent_students l
      JOIN students s ON CAST(s.${quoteIdentifier(idCol)} AS TEXT) = l.student_id
      WHERE l.parent_user_id = ? AND CAST(l.school_id AS TEXT) = ?
        AND CAST(s.${quoteIdentifier(schoolCol)} AS TEXT) = ?
      ORDER BY s.${quoteIdentifier(nameCol)} COLLATE NOCASE`;
    const result = await env.DB.prepare(sql).bind(auth.user.id, String(auth.user.school_id), String(auth.user.school_id)).all();
    return json({ ok: true, children: result.results || [] });
  } catch (error) {
    console.error("Parent child list failed:", error);
    return json({ error: "Could not load the children linked to this parent account." }, 500);
  }
}
__name(onRequestGet3, "onRequestGet");

// api/platform/bootstrap.js
async function onRequestPost6({ request, env }) {
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
__name(onRequestPost6, "onRequestPost");

// api/public/schools.js
function validPaidUntil2(value) {
  if (!value) return false;
  const raw = String(value).trim();
  const expiry = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw);
  return Number.isFinite(expiry) && expiry >= Date.now();
}
__name(validPaidUntil2, "validPaidUntil");
async function onRequestGet4({ env }) {
  try {
    const columns = await getTableInfo(env.DB, "schools");
    const idCol = pickColumn(columns, ["id", "school_id"]);
    const nameCol = pickColumn(columns, ["name", "school_name", "title"]);
    const slugCol = pickColumn(columns, ["slug", "code"]);
    if (!idCol || !nameCol) return json({ error: "School schema is not ready." }, 500);
    const statusCol = pickColumn(columns, ["status"]);
    const sql = `SELECT CAST(s.${quoteIdentifier(idCol)} AS TEXT) AS id,
      s.${quoteIdentifier(nameCol)} AS name,
      ${slugCol ? `s.${quoteIdentifier(slugCol)}` : "NULL"} AS school_code,
      a.status AS access_status, a.paid_until AS paid_until,
      ${statusCol ? `s.${quoteIdentifier(statusCol)}` : "NULL"} AS school_status
      FROM schools s LEFT JOIN school_access a
      ON a.school_id = CAST(s.${quoteIdentifier(idCol)} AS TEXT)
      ORDER BY s.${quoteIdentifier(nameCol)} COLLATE NOCASE`;
    const result = await env.DB.prepare(sql).all();
    const schools = (result.results || []).filter((row) => String(row.access_status || row.school_status || "").toUpperCase() === "ACTIVE" && validPaidUntil2(row.paid_until)).map((row) => ({ id: row.id, name: row.name, school_code: row.school_code || "" }));
    return json({ ok: true, schools });
  } catch (error) {
    console.error("Public school list failed:", error);
    return json({ error: "Could not load available schools." }, 500);
  }
}
__name(onRequestGet4, "onRequestGet");

// api/schools/approve.js
async function onRequestPost7({ request, env }) {
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
      body?.paid_until || body?.expires_at || ""
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
    const parsedExpiry = Date.parse(paidUntil);
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
    `).bind(schoolId).first();
    if (!school) {
      return json(
        { error: "School was not found." },
        404
      );
    }
    const existingAdmin = await env.DB.prepare(`
        SELECT
          id,
          email,
          full_name
        FROM auth_users
        WHERE CAST(school_id AS TEXT) = CAST(? AS TEXT)
          AND role = 'SCHOOL_ADMIN'
        LIMIT 1
      `).bind(schoolId).first();
    if (!existingAdmin) {
      const adminName = String(
        body?.admin_name || body?.full_name || ""
      ).trim();
      const adminEmail = String(
        body?.admin_email || body?.email || ""
      ).trim().toLowerCase();
      const adminPassword = String(
        body?.admin_password || body?.password || ""
      );
      if (!adminName || !adminEmail || !adminPassword) {
        return json({
          error: "This school has no School Administrator yet. Administrator name, email and password are required for first activation."
        }, 400);
      }
      if (adminPassword.length < 12) {
        return json({
          error: "School administrator password must be at least 12 characters."
        }, 400);
      }
      const emailOwner = await env.DB.prepare(`
          SELECT id, school_id
          FROM auth_users
          WHERE email = ? COLLATE NOCASE
          LIMIT 1
        `).bind(adminEmail).first();
      if (emailOwner) {
        return json({
          error: "That email already belongs to another account."
        }, 409);
      }
      const adminId = randomId();
      const { salt, hash } = await hashPassword(
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
      `).bind(
        adminId,
        schoolId,
        adminName,
        adminEmail,
        salt,
        hash
      ).run();
    }
    await env.DB.prepare(`
      UPDATE schools
      SET status = 'Active'
      WHERE CAST(id AS TEXT) = CAST(? AS TEXT)
    `).bind(schoolId).run();
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
    `).bind(
      schoolId,
      plan,
      paidUntil
    ).run();
    await env.DB.prepare(`
      UPDATE auth_users
      SET active = 1
      WHERE CAST(school_id AS TEXT) = CAST(? AS TEXT)
        AND role = 'SCHOOL_ADMIN'
    `).bind(schoolId).run();
    const savedAccess = await env.DB.prepare(`
        SELECT
          school_id,
          status,
          plan,
          paid_until,
          updated_at
        FROM school_access
        WHERE CAST(school_id AS TEXT) = CAST(? AS TEXT)
        LIMIT 1
      `).bind(schoolId).first();
    if (!savedAccess) {
      return json({
        error: "School access was not saved."
      }, 500);
    }
    return json({
      ok: true,
      school_id: schoolId,
      school_name: school.name,
      status: savedAccess.status,
      plan: savedAccess.plan,
      paid_until: savedAccess.paid_until,
      updated_at: savedAccess.updated_at,
      existing_admin: Boolean(existingAdmin),
      message: `${school.name} access updated successfully until ${savedAccess.paid_until}.`
    });
  } catch (error) {
    console.error(
      "School approval failed:",
      error
    );
    return json({
      error: error?.message || "School approval could not be completed."
    }, 500);
  }
}
__name(onRequestPost7, "onRequestPost");

// api/schools/delete.js
async function onRequestPost8({ request, env }) {
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
    await env.DB.prepare(`
      DELETE FROM auth_sessions
      WHERE user_id IN (
        SELECT id FROM auth_users WHERE school_id = ?
      )
    `).bind(schoolId).run();
    await env.DB.prepare(
      `DELETE FROM auth_users WHERE school_id = ?`
    ).bind(schoolId).run();
    await env.DB.prepare(
      `DELETE FROM school_access WHERE school_id = ?`
    ).bind(schoolId).run();
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
__name(onRequestPost8, "onRequestPost");

// api/announcements.js
var STAFF_ROLES = [
  "SCHOOL_ADMIN",
  "DEPUTY",
  "SENIOR_MANAGER",
  "SECRETARY",
  "FINANCE_OFFICE",
  "TEACHER"
];
async function onRequestGet5({ request, env }) {
  const auth = await requireRole(request, env, [
    ...STAFF_ROLES,
    "PARENT"
  ]);
  if (!auth.user) return auth.response;
  const user = auth.user;
  const schoolId = String(user.school_id || "");
  if (!schoolId) {
    return json({ error: "School account is required." }, 400);
  }
  let sql = `
    SELECT
      a.id,
      a.school_id,
      a.title,
      a.body,
      a.audience,
      a.created_at,
      u.full_name AS author
    FROM auth_announcements a
    LEFT JOIN auth_users u ON u.id = a.created_by
    WHERE CAST(a.school_id AS TEXT) = ?
  `;
  if (user.role === "PARENT") {
    sql += " AND a.audience IN ('ALL', 'PARENTS')";
  } else if (user.role === "TEACHER") {
    sql += " AND a.audience IN ('ALL', 'TEACHERS', 'STAFF')";
  } else if (user.role === "FINANCE_OFFICE") {
    sql += " AND a.audience IN ('ALL', 'STAFF')";
  } else {
    sql += " AND a.audience IN ('ALL', 'PARENTS', 'TEACHERS', 'STAFF')";
  }
  sql += " ORDER BY a.created_at DESC LIMIT 200";
  try {
    const rows = await env.DB.prepare(sql).bind(schoolId).all();
    return json({
      ok: true,
      announcements: rows.results || []
    });
  } catch (error) {
    console.error("Announcements GET failed:", error);
    return json({ error: "Unable to load announcements." }, 500);
  }
}
__name(onRequestGet5, "onRequestGet");
async function onRequestPost9({ request, env }) {
  const auth = await requireRole(request, env, [
    "SCHOOL_ADMIN",
    "DEPUTY",
    "SENIOR_MANAGER",
    "SECRETARY"
  ]);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const title = String(body?.title || "").trim().slice(0, 160);
  const text = String(body?.body || "").trim().slice(0, 5e3);
  const audience = String(body?.audience || "ALL").toUpperCase();
  if (!title || !text || !["ALL", "PARENTS", "TEACHERS", "STAFF"].includes(audience)) {
    return json({
      error: "Provide a title, message and valid audience."
    }, 400);
  }
  const id = randomId();
  try {
    await env.DB.prepare(`
      INSERT INTO auth_announcements
        (id, school_id, title, body, audience, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      String(auth.user.school_id),
      title,
      text,
      audience,
      auth.user.id
    ).run();
    await writeAudit(
      env.DB,
      auth.user,
      auth.user.school_id,
      "ANNOUNCEMENT_CREATE",
      "announcement",
      id,
      { title, audience }
    );
    return json({ ok: true, id }, 201);
  } catch (error) {
    console.error("Announcements POST failed:", error);
    return json({ error: "Unable to publish announcement." }, 500);
  }
}
__name(onRequestPost9, "onRequestPost");

// api/attendance.js
async function onRequestGet6({ request, env }) {
  const auth = await requireRole(request, env, ["PLATFORM_ADMIN", "SCHOOL_ADMIN", "SECRETARY", "TEACHER", "PARENT"]);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const schoolId = auth.user.role === "PLATFORM_ADMIN" ? String(url.searchParams.get("school_id") || "") : String(auth.user.school_id);
  if (!schoolId) return json({ error: "school_id is required." }, 400);
  const shape = await studentShape(env.DB);
  const idCol = quoteIdentifier(shape.id);
  const schoolCol = quoteIdentifier(shape.school);
  const nameCol = quoteIdentifier(shape.name);
  const classExpr = shape.className ? `CAST(s.${quoteIdentifier(shape.className)} AS TEXT)` : `''`;
  let sql = `SELECT a.id, a.school_id, a.student_id, st.${nameCol} AS student_name, a.attendance_date, a.status, a.note, a.created_at
    FROM auth_attendance a JOIN students st ON CAST(st.${idCol} AS TEXT) = a.student_id
    WHERE CAST(a.school_id AS TEXT) = ? AND CAST(st.${schoolCol} AS TEXT) = ?`;
  const params = [schoolId, schoolId];
  if (auth.user.role === "PARENT") {
    sql += ` AND EXISTS (SELECT 1 FROM auth_parent_students l WHERE l.parent_user_id = ? AND CAST(l.student_id AS TEXT) = a.student_id AND CAST(l.school_id AS TEXT) = ?)`;
    params.push(auth.user.id, schoolId);
  }
  if (auth.user.role === "TEACHER") {
    sql += ` AND EXISTS (SELECT 1 FROM auth_teacher_assignments x WHERE x.teacher_user_id = ? AND CAST(x.school_id AS TEXT) = ? AND x.class_name = COALESCE((SELECT ${classExpr} FROM students s WHERE CAST(s.${idCol} AS TEXT) = a.student_id LIMIT 1), '') AND x.can_attend = 1)`;
    params.push(auth.user.id, schoolId);
  }
  const studentId = url.searchParams.get("student_id");
  if (studentId) {
    if (auth.user.role === "PARENT" && !await parentCanSeeStudent(env.DB, auth.user, studentId)) return json({ error: "This student is not linked to your parent account." }, 403);
    sql += " AND CAST(a.student_id AS TEXT) = ?";
    params.push(studentId);
  }
  const date = url.searchParams.get("date");
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    sql += " AND a.attendance_date = ?";
    params.push(date);
  }
  sql += " ORDER BY a.attendance_date DESC LIMIT 1000";
  const result = await env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, attendance: result.results || [] });
}
__name(onRequestGet6, "onRequestGet");
async function onRequestPost10({ request, env }) {
  const auth = await requireRole(request, env, ["SCHOOL_ADMIN", "SECRETARY", "TEACHER"]);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const studentId = String(body?.student_id || "");
  const date = String(body?.attendance_date || "");
  const status = String(body?.status || "").toUpperCase();
  const note = String(body?.note || "").trim().slice(0, 500);
  if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !["PRESENT", "ABSENT", "LATE", "EXCUSED"].includes(status)) return json({ error: "Provide student_id, attendance_date (YYYY-MM-DD), and status PRESENT, ABSENT, LATE or EXCUSED." }, 400);
  const student = await findStudent(env.DB, studentId, auth.user.school_id);
  if (!student) return json({ error: "Student does not belong to your school." }, 404);
  if (auth.user.role === "TEACHER") {
    const assigned = await env.DB.prepare(`SELECT 1 AS ok FROM auth_teacher_assignments WHERE teacher_user_id = ? AND CAST(school_id AS TEXT) = ? AND class_name = ? AND can_attend = 1 LIMIT 1`).bind(auth.user.id, String(auth.user.school_id), String(student.class_name || "")).first();
    if (!assigned) return json({ error: "You are not assigned attendance access for this class." }, 403);
  }
  const id = randomId();
  try {
    await env.DB.prepare(`INSERT INTO auth_attendance (id, school_id, student_id, attendance_date, status, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(school_id, student_id, attendance_date) DO UPDATE SET status = excluded.status, note = excluded.note, created_by = excluded.created_by`).bind(id, String(auth.user.school_id), studentId, date, status, note, auth.user.id).run();
    await writeAudit(env.DB, auth.user, auth.user.school_id, "ATTENDANCE_UPSERT", "attendance", studentId, { attendance_date: date, status });
    return json({ ok: true, message: "Attendance saved." }, 201);
  } catch (e) {
    console.error("Attendance write failed:", e);
    return json({ error: "Could not save attendance. Confirm the student schema and migration." }, 500);
  }
}
__name(onRequestPost10, "onRequestPost");

// api/audit-events.js
async function onRequestGet7({ request, env }) {
  const auth = await requireRole(request, env, ["PLATFORM_ADMIN", "SCHOOL_ADMIN"]);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "100", 10) || 100));
  let rows;
  if (auth.user.role === "PLATFORM_ADMIN") {
    const schoolId = String(url.searchParams.get("school_id") || "");
    if (schoolId) rows = await env.DB.prepare(`SELECT e.*, u.full_name AS actor_name, u.email AS actor_email FROM auth_audit_events e LEFT JOIN auth_users u ON u.id = e.actor_user_id WHERE CAST(e.school_id AS TEXT) = ? ORDER BY e.created_at DESC LIMIT ?`).bind(schoolId, limit).all();
    else rows = await env.DB.prepare(`SELECT e.*, u.full_name AS actor_name, u.email AS actor_email FROM auth_audit_events e LEFT JOIN auth_users u ON u.id = e.actor_user_id ORDER BY e.created_at DESC LIMIT ?`).bind(limit).all();
  } else {
    rows = await env.DB.prepare(`SELECT e.*, u.full_name AS actor_name, u.email AS actor_email FROM auth_audit_events e LEFT JOIN auth_users u ON u.id = e.actor_user_id WHERE CAST(e.school_id AS TEXT) = ? ORDER BY e.created_at DESC LIMIT ?`).bind(String(auth.user.school_id), limit).all();
  }
  return json({ ok: true, events: rows.results || [] });
}
__name(onRequestGet7, "onRequestGet");

// api/fees.js
async function onRequestGet8({ request, env }) {
  const auth = await requireRole(request, env, ["PLATFORM_ADMIN", "SCHOOL_ADMIN", "SECRETARY", "PARENT"]);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const schoolId = auth.user.role === "PLATFORM_ADMIN" ? String(url.searchParams.get("school_id") || "") : String(auth.user.school_id);
  if (!schoolId) return json({ error: "school_id is required." }, 400);
  const shape = await studentShape(env.DB);
  const idCol = quoteIdentifier(shape.id);
  const schoolCol = quoteIdentifier(shape.school);
  const nameCol = quoteIdentifier(shape.name);
  let sql = `SELECT f.id, f.school_id, f.student_id, st.${nameCol} AS student_name, f.entry_type, f.amount, f.description, f.reference, f.transaction_date, f.created_at
    FROM auth_fee_transactions f JOIN students st ON CAST(st.${idCol} AS TEXT) = f.student_id
    WHERE CAST(f.school_id AS TEXT) = ? AND CAST(st.${schoolCol} AS TEXT) = ?`;
  const params = [schoolId, schoolId];
  if (auth.user.role === "PARENT") {
    sql += ` AND EXISTS (SELECT 1 FROM auth_parent_students l WHERE l.parent_user_id = ? AND CAST(l.student_id AS TEXT) = f.student_id AND CAST(l.school_id AS TEXT) = ?)`;
    params.push(auth.user.id, schoolId);
  }
  const studentId = url.searchParams.get("student_id");
  if (studentId) {
    if (auth.user.role === "PARENT" && !await parentCanSeeStudent(env.DB, auth.user, studentId)) return json({ error: "This student is not linked to your parent account." }, 403);
    sql += " AND CAST(f.student_id AS TEXT) = ?";
    params.push(studentId);
  }
  sql += " ORDER BY f.transaction_date DESC, f.created_at DESC LIMIT 1000";
  const rows = await env.DB.prepare(sql).bind(...params).all();
  const tx = rows.results || [];
  const summary = tx.reduce((sum, item) => {
    const amount = Number(item.amount) || 0;
    if (item.entry_type === "CHARGE") sum.charged += amount;
    else if (item.entry_type === "PAYMENT") sum.paid += amount;
    else sum.adjustments += amount;
    return sum;
  }, { charged: 0, paid: 0, adjustments: 0 });
  summary.balance = summary.charged + summary.adjustments - summary.paid;
  return json({ ok: true, transactions: tx, summary });
}
__name(onRequestGet8, "onRequestGet");
async function onRequestPost11({ request, env }) {
  const auth = await requireRole(request, env, ["SCHOOL_ADMIN", "SECRETARY"]);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const studentId = String(body?.student_id || "");
  const type = String(body?.entry_type || "").toUpperCase();
  const amount = Number(body?.amount);
  const description = String(body?.description || "").trim().slice(0, 250);
  const reference = String(body?.reference || "").trim().slice(0, 120);
  const transactionDate = String(body?.transaction_date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
  if (!studentId || !["CHARGE", "PAYMENT", "ADJUSTMENT"].includes(type) || !Number.isFinite(amount) || amount <= 0 || !description || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) return json({ error: "Provide student_id, valid entry_type, positive amount, description and transaction_date." }, 400);
  if (type === "ADJUSTMENT" && auth.user.role !== "SCHOOL_ADMIN") return json({ error: "Only school administrators can create adjustments." }, 403);
  const student = await findStudent(env.DB, studentId, auth.user.school_id);
  if (!student) return json({ error: "Student does not belong to your school." }, 404);
  const id = randomId();
  await env.DB.prepare(`INSERT INTO auth_fee_transactions (id, school_id, student_id, entry_type, amount, description, reference, transaction_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, String(auth.user.school_id), studentId, type, amount, description, reference, transactionDate, auth.user.id).run();
  await writeAudit(env.DB, auth.user, auth.user.school_id, "FEE_TRANSACTION_CREATE", "fee_transaction", id, { student_id: studentId, entry_type: type, amount, reference });
  return json({ ok: true, id }, 201);
}
__name(onRequestPost11, "onRequestPost");

// api/health.js
async function onRequestGet9() {
  return Response.json({
    ok: true,
    service: "Liffan All-School Platform API",
    note: "Health check only. Configure D1 and authentication before using real school data."
  });
}
__name(onRequestGet9, "onRequestGet");

// api/invitations.js
async function onRequestGet10({ request, env }) {
  const auth = await requireRole(request, env, ["SCHOOL_ADMIN"]);
  if (!auth.user) return auth.response;
  const rows = await env.DB.prepare(`SELECT id, email, role, student_ref, expires_at, claimed_at, created_at FROM auth_invitations WHERE CAST(school_id AS TEXT) = ? ORDER BY created_at DESC LIMIT 200`).bind(String(auth.user.school_id)).all();
  return json({ ok: true, invitations: rows.results || [] });
}
__name(onRequestGet10, "onRequestGet");
async function onRequestPost12({ request, env }) {
  const auth = await requireRole(request, env, ["SCHOOL_ADMIN"]);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const email = String(body?.email || "").trim().toLowerCase();
  const role = String(body?.role || "").toUpperCase();
  const studentRef = String(body?.student_ref || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["SECRETARY", "TEACHER", "PARENT"].includes(role)) return json({ error: "Provide a valid email and role SECRETARY, TEACHER or PARENT." }, 400);
  if (role === "PARENT" && !studentRef) return json({ error: "Parent invitations must include the child admission number." }, 400);
  const exists = await env.DB.prepare("SELECT id FROM auth_users WHERE email = ? COLLATE NOCASE LIMIT 1").bind(email).first();
  if (exists) return json({ error: "This email already has an account." }, 409);
  const rawToken = makeRandomToken(32);
  const hash = await sha256Base64Url(rawToken);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1e3).toISOString();
  const id = randomId();
  await env.DB.prepare(`INSERT INTO auth_invitations (id, school_id, email, role, student_ref, token_hash, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, String(auth.user.school_id), email, role, role === "PARENT" ? studentRef : null, hash, expiresAt, auth.user.id).run();
  await writeAudit(env.DB, auth.user, auth.user.school_id, "INVITATION_CREATE", "invitation", id, { email, role, expires_at: expiresAt });
  return json({ ok: true, invitation_id: id, invite_code: rawToken, expires_at: expiresAt, message: "Copy this one-time code and share it with the intended person through a trusted channel. The code is shown only once." }, 201);
}
__name(onRequestPost12, "onRequestPost");

// api/marks.js
async function onRequestGet11({ request, env }) {
  const auth = await requireRole(request, env, ["PLATFORM_ADMIN", "SCHOOL_ADMIN", "SECRETARY", "TEACHER", "PARENT"]);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const schoolId = auth.user.role === "PLATFORM_ADMIN" ? String(url.searchParams.get("school_id") || "") : String(auth.user.school_id);
  if (!schoolId) return json({ error: "school_id is required." }, 400);
  const shape = await studentShape(env.DB);
  const idCol = quoteIdentifier(shape.id);
  const schoolCol = quoteIdentifier(shape.school);
  const nameCol = quoteIdentifier(shape.name);
  const classExpr = shape.className ? `CAST(s.${quoteIdentifier(shape.className)} AS TEXT)` : `''`;
  let sql = `SELECT m.id, m.school_id, m.student_id, st.${nameCol} AS student_name, m.subject_id, sub.name AS subject_name,
    m.assessment_name, m.term, m.score, m.max_score, m.remarks, m.created_at
    FROM auth_marks m JOIN students st ON CAST(st.${idCol} AS TEXT) = m.student_id
    JOIN auth_subjects sub ON sub.id = m.subject_id WHERE CAST(m.school_id AS TEXT) = ? AND CAST(st.${schoolCol} AS TEXT) = ?`;
  const params = [schoolId, schoolId];
  if (auth.user.role === "PARENT") {
    sql += ` AND EXISTS (SELECT 1 FROM auth_parent_students l WHERE l.parent_user_id = ? AND CAST(l.student_id AS TEXT) = m.student_id AND CAST(l.school_id AS TEXT) = ?)`;
    params.push(auth.user.id, schoolId);
  }
  if (auth.user.role === "TEACHER") {
    sql += ` AND EXISTS (SELECT 1 FROM auth_teacher_assignments a WHERE a.teacher_user_id = ? AND a.subject_id = m.subject_id AND CAST(a.school_id AS TEXT) = ? AND a.class_name = COALESCE((SELECT ${classExpr} FROM students s WHERE CAST(s.${idCol} AS TEXT) = m.student_id LIMIT 1),''))`;
    params.push(auth.user.id, schoolId);
  }
  const studentId = url.searchParams.get("student_id");
  if (studentId) {
    if (auth.user.role === "PARENT" && !await parentCanSeeStudent(env.DB, auth.user, studentId)) return json({ error: "This student is not linked to your parent account." }, 403);
    sql += " AND CAST(m.student_id AS TEXT) = ?";
    params.push(studentId);
  }
  sql += " ORDER BY m.created_at DESC LIMIT 500";
  const result = await env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, marks: result.results || [] });
}
__name(onRequestGet11, "onRequestGet");
async function onRequestPost13({ request, env }) {
  const auth = await requireRole(request, env, ["SCHOOL_ADMIN", "TEACHER"]);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const studentId = String(body?.student_id || "");
  const subjectId = String(body?.subject_id || "");
  const assessment = String(body?.assessment_name || "").trim().slice(0, 100);
  const term = String(body?.term || "").trim().slice(0, 40);
  const score = Number(body?.score);
  const maxScore = Number(body?.max_score);
  const remarks = String(body?.remarks || "").trim().slice(0, 500);
  if (!studentId || !subjectId || !assessment || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore) return json({ error: "Provide student_id, subject_id, assessment_name, a valid score and max_score." }, 400);
  const student = await findStudent(env.DB, studentId, auth.user.school_id);
  if (!student) return json({ error: "Student does not belong to your school." }, 404);
  const subject = await env.DB.prepare("SELECT id, class_name FROM auth_subjects WHERE id = ? AND CAST(school_id AS TEXT) = ? LIMIT 1").bind(subjectId, String(auth.user.school_id)).first();
  if (!subject) return json({ error: "Subject does not belong to your school." }, 404);
  if (auth.user.role === "TEACHER" && (String(subject.class_name) !== String(student.class_name || "") || !await teacherHasAssignment(env.DB, auth.user, subjectId, student.class_name, "can_mark"))) return json({ error: "You are not assigned to mark this subject and class." }, 403);
  const id = randomId();
  await env.DB.prepare(`INSERT INTO auth_marks (id, school_id, student_id, subject_id, assessment_name, term, score, max_score, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, String(auth.user.school_id), studentId, subjectId, assessment, term, score, maxScore, remarks, auth.user.id).run();
  await writeAudit(env.DB, auth.user, auth.user.school_id, "MARK_CREATE", "mark", id, { student_id: studentId, subject_id: subjectId, term, score, max_score: maxScore });
  return json({ ok: true, id }, 201);
}
__name(onRequestPost13, "onRequestPost");

// api/reports.js
async function onRequestGet12({ request, env }) {
  const auth = await requireRole(request, env, ["PLATFORM_ADMIN", "SCHOOL_ADMIN", "SECRETARY", "PARENT"]);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const schoolId = auth.user.role === "PLATFORM_ADMIN" ? String(url.searchParams.get("school_id") || "") : String(auth.user.school_id);
  if (!schoolId) return json({ error: "school_id is required." }, 400);
  const shape = await studentShape(env.DB);
  const studentIdCol = quoteIdentifier(shape.id);
  const studentSchoolCol = quoteIdentifier(shape.school);
  const parentFilter = auth.user.role === "PARENT";
  const studentWhere = parentFilter ? ` AND EXISTS (SELECT 1 FROM auth_parent_students l WHERE l.parent_user_id = ? AND CAST(l.school_id AS TEXT) = ? AND CAST(l.student_id AS TEXT) = CAST(st.${studentIdCol} AS TEXT))` : "";
  const countParams = parentFilter ? [schoolId, auth.user.id, schoolId] : [schoolId];
  const studentCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM students st WHERE CAST(st.${studentSchoolCol} AS TEXT) = ?${studentWhere}`).bind(...countParams).first();
  const parentExists = /* @__PURE__ */ __name((columnAlias) => parentFilter ? ` AND EXISTS (SELECT 1 FROM auth_parent_students l WHERE l.parent_user_id = ? AND CAST(l.school_id AS TEXT) = ? AND CAST(l.student_id AS TEXT) = CAST(${columnAlias}.student_id AS TEXT))` : "", "parentExists");
  const bindScoped = /* @__PURE__ */ __name((extra) => parentFilter ? [schoolId, schoolId, auth.user.id, schoolId] : [schoolId, schoolId], "bindScoped");
  const attendance = await env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) AS present,
    SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent
    FROM auth_attendance a JOIN students st ON CAST(st.${studentIdCol} AS TEXT) = a.student_id
    WHERE CAST(a.school_id AS TEXT) = ? AND CAST(st.${studentSchoolCol} AS TEXT) = ?${parentExists("a")}`).bind(...bindScoped()).first();
  const fee = await env.DB.prepare(`SELECT SUM(CASE WHEN f.entry_type = 'CHARGE' THEN f.amount WHEN f.entry_type = 'PAYMENT' THEN -f.amount ELSE f.amount END) AS balance
    FROM auth_fee_transactions f JOIN students st ON CAST(st.${studentIdCol} AS TEXT) = f.student_id
    WHERE CAST(f.school_id AS TEXT) = ? AND CAST(st.${studentSchoolCol} AS TEXT) = ?${parentExists("f")}`).bind(...bindScoped()).first();
  const mark = await env.DB.prepare(`SELECT AVG((m.score / m.max_score) * 100.0) AS average_score
    FROM auth_marks m JOIN students st ON CAST(st.${studentIdCol} AS TEXT) = m.student_id
    WHERE CAST(m.school_id AS TEXT) = ? AND CAST(st.${studentSchoolCol} AS TEXT) = ?${parentExists("m")}`).bind(...bindScoped()).first();
  return json({ ok: true, school_id: schoolId, summary: {
    students: Number(studentCount?.count || 0),
    attendance_records: Number(attendance?.total || 0),
    present: Number(attendance?.present || 0),
    absent: Number(attendance?.absent || 0),
    fee_balance: Number(fee?.balance || 0),
    average_score_percent: mark?.average_score == null ? null : Math.round(Number(mark.average_score) * 100) / 100
  } });
}
__name(onRequestGet12, "onRequestGet");

// api/school-profile.js
var EDIT_ROLES = [
  "SCHOOL_ADMIN",
  "SECRETARY"
];
async function onRequestGet13({ request, env }) {
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
    `).bind(schoolId).first();
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
    `).bind(schoolId).all();
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
__name(onRequestGet13, "onRequestGet");
async function onRequestPost14({ request, env }) {
  try {
    const auth = await requireRole(
      request,
      env,
      EDIT_ROLES
    );
    if (!auth.user) return auth.response;
    const schoolId = String(auth.user.school_id || "");
    if (!schoolId) {
      return json({
        error: "No school is assigned to this account."
      }, 400);
    }
    const body = await parseJson(request);
    const action = String(body?.action || "UPDATE_PROFILE").trim().toUpperCase();
    if (action === "UPDATE_PROFILE") {
      const name = String(body?.name || "").trim();
      const schoolType = String(body?.school_type || "School").trim();
      const location = String(body?.location || "").trim();
      const motto = String(body?.motto || "").trim();
      const phone = String(body?.phone || "").trim();
      const email = String(body?.email || "").trim();
      const website = String(body?.website || "").trim();
      const description = String(body?.description || "").trim();
      const logoUrl = String(body?.logo_url || "").trim();
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
      `).bind(
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
      ).run();
      return json({
        ok: true,
        message: "School profile updated successfully."
      });
    }
    if (action === "ADD_PHOTO") {
      const photoUrl = String(body?.photo_url || "").trim();
      const caption = String(body?.caption || "").trim();
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
      `).bind(
        id,
        schoolId,
        photoUrl,
        caption || null,
        auth.user.id
      ).run();
      return json({
        ok: true,
        message: "School photo added successfully.",
        photo_id: id
      }, 201);
    }
    if (action === "DELETE_PHOTO") {
      const photoId = String(body?.photo_id || "").trim();
      if (!photoId) {
        return json({
          error: "Photo ID is required."
        }, 400);
      }
      await env.DB.prepare(`
        DELETE FROM school_photos
        WHERE id = ?
          AND CAST(school_id AS TEXT) = ?
      `).bind(
        photoId,
        schoolId
      ).run();
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
__name(onRequestPost14, "onRequestPost");

// api/schools.js
async function onRequestPost15({ request, env }) {
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
    const existing = await env.DB.prepare(`
        SELECT id
        FROM schools
        WHERE name = ? COLLATE NOCASE
        LIMIT 1
      `).bind(name).first();
    if (existing) {
      return json(
        {
          error: "A school with this name already exists or has already applied."
        },
        409
      );
    }
    const schoolId = randomId();
    await env.DB.prepare(`
        INSERT INTO schools (
          id,
          name,
          school_type,
          location,
          logo_url,
          status
        )
        VALUES (?, ?, ?, ?, ?, 'Pending')
      `).bind(
      schoolId,
      name,
      schoolType || "School",
      location || null,
      logoUrl || null
    ).run();
    return json(
      {
        ok: true,
        school_id: schoolId,
        status: "Pending",
        message: "School application received. Liffan will activate the school after approval."
      },
      201
    );
  } catch (error) {
    console.error("School registration failed:", error);
    return json(
      {
        error: "School registration could not be completed."
      },
      500
    );
  }
}
__name(onRequestPost15, "onRequestPost");
async function onRequestGet14({ request, env }) {
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
__name(onRequestGet14, "onRequestGet");

// api/subjects.js
async function onRequestGet15({ request, env }) {
  const auth = await requireRole(request, env, ["PLATFORM_ADMIN", "SCHOOL_ADMIN", "SECRETARY", "TEACHER"]);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const schoolId = auth.user.role === "PLATFORM_ADMIN" ? String(url.searchParams.get("school_id") || "") : String(auth.user.school_id);
  if (!schoolId) return json({ error: "school_id is required for platform-admin views." }, 400);
  let sql = "SELECT id, school_id, name, code, class_name, created_at FROM auth_subjects WHERE CAST(school_id AS TEXT) = ?";
  const params = [schoolId];
  if (auth.user.role === "TEACHER") {
    sql += " AND EXISTS (SELECT 1 FROM auth_teacher_assignments a WHERE a.subject_id = auth_subjects.id AND a.teacher_user_id = ? AND CAST(a.school_id AS TEXT) = ?)";
    params.push(auth.user.id, schoolId);
  }
  sql += " ORDER BY class_name, name";
  const rows = await env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, subjects: rows.results || [] });
}
__name(onRequestGet15, "onRequestGet");
async function onRequestPost16({ request, env }) {
  const auth = await requireRole(request, env, ["SCHOOL_ADMIN", "SECRETARY"]);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const name = String(body?.name || "").trim().slice(0, 100);
  const code = String(body?.code || "").trim().slice(0, 40);
  const className = String(body?.class_name || "").trim().slice(0, 80);
  if (!name || !className) return json({ error: "Subject name and class_name are required." }, 400);
  const id = randomId();
  try {
    await env.DB.prepare("INSERT INTO auth_subjects (id, school_id, name, code, class_name, created_by) VALUES (?, ?, ?, ?, ?, ?)").bind(id, String(auth.user.school_id), name, code, className, auth.user.id).run();
    await writeAudit(env.DB, auth.user, auth.user.school_id, "SUBJECT_CREATE", "subject", id, { name, class_name: className });
    return json({ ok: true, id, message: "Subject created." }, 201);
  } catch (e) {
    console.error("Subject create failed:", e);
    return json({ error: "Could not create subject. A subject with this name may already exist for that class." }, 409);
  }
}
__name(onRequestPost16, "onRequestPost");

// api/teacher-assignments.js
async function onRequestGet16({ request, env }) {
  const auth = await requireRole(request, env, ["PLATFORM_ADMIN", "SCHOOL_ADMIN", "TEACHER"]);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  const schoolId = auth.user.role === "PLATFORM_ADMIN" ? String(url.searchParams.get("school_id") || "") : String(auth.user.school_id);
  if (!schoolId) return json({ error: "school_id is required." }, 400);
  let sql = `SELECT a.id, a.school_id, a.teacher_user_id, u.full_name AS teacher_name, a.subject_id,
    s.name AS subject_name, a.class_name, a.can_mark, a.can_attend, a.created_at
    FROM auth_teacher_assignments a JOIN auth_users u ON u.id = a.teacher_user_id
    JOIN auth_subjects s ON s.id = a.subject_id WHERE CAST(a.school_id AS TEXT) = ?`;
  const params = [schoolId];
  if (auth.user.role === "TEACHER") {
    sql += " AND a.teacher_user_id = ?";
    params.push(auth.user.id);
  }
  sql += " ORDER BY a.class_name, s.name, u.full_name";
  const rows = await env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, assignments: rows.results || [] });
}
__name(onRequestGet16, "onRequestGet");
async function onRequestPost17({ request, env }) {
  const auth = await requireRole(request, env, ["SCHOOL_ADMIN"]);
  if (!auth.user) return auth.response;
  const body = await parseJson(request);
  const teacherId = String(body?.teacher_user_id || "");
  const subjectId = String(body?.subject_id || "");
  const className = String(body?.class_name || "").trim().slice(0, 80);
  const canMark = body?.can_mark === false ? 0 : 1;
  const canAttend = body?.can_attend === false ? 0 : 1;
  if (!teacherId || !subjectId || !className) return json({ error: "teacher_user_id, subject_id and class_name are required." }, 400);
  const teacher = await env.DB.prepare(`SELECT id FROM auth_users WHERE id = ? AND role = 'TEACHER' AND active = 1 AND CAST(school_id AS TEXT) = ? LIMIT 1`).bind(teacherId, String(auth.user.school_id)).first();
  const subject = await env.DB.prepare("SELECT id, class_name FROM auth_subjects WHERE id = ? AND CAST(school_id AS TEXT) = ? LIMIT 1").bind(subjectId, String(auth.user.school_id)).first();
  if (!teacher || !subject || String(subject.class_name) !== className) return json({ error: "Teacher and subject must belong to your school, and the assignment class must match the subject class." }, 400);
  const id = randomId();
  try {
    await env.DB.prepare(`INSERT INTO auth_teacher_assignments
      (id, school_id, teacher_user_id, subject_id, class_name, can_mark, can_attend, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, String(auth.user.school_id), teacherId, subjectId, className, canMark, canAttend, auth.user.id).run();
    await writeAudit(env.DB, auth.user, auth.user.school_id, "TEACHER_ASSIGN", "teacher_assignment", id, { teacher_user_id: teacherId, subject_id: subjectId, class_name: className });
    return json({ ok: true, id }, 201);
  } catch (e) {
    console.error("Teacher assignment failed:", e);
    return json({ error: "Could not create assignment. It may already exist." }, 409);
  }
}
__name(onRequestPost17, "onRequestPost");

// api/users.js
async function onRequestGet17({ request, env }) {
  const auth = await requireRole(request, env, ["PLATFORM_ADMIN", "SCHOOL_ADMIN"]);
  if (!auth.user) return auth.response;
  const url = new URL(request.url);
  let schoolId = String(auth.user.school_id || "");
  if (auth.user.role === "PLATFORM_ADMIN") schoolId = String(url.searchParams.get("school_id") || "");
  if (!schoolId) return json({ error: "school_id is required." }, 400);
  const role = String(url.searchParams.get("role") || "").toUpperCase();
  const validRoles = ["SCHOOL_ADMIN", "SECRETARY", "TEACHER", "PARENT"];
  let sql = `SELECT id, school_id, full_name, email, role, active, created_at FROM auth_users WHERE CAST(school_id AS TEXT) = ?`;
  const params = [schoolId];
  if (role) {
    if (!validRoles.includes(role)) return json({ error: "Invalid role filter." }, 400);
    sql += " AND role = ?";
    params.push(role);
  }
  sql += " ORDER BY role, full_name LIMIT 500";
  const rows = await env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, users: rows.results || [] });
}
__name(onRequestGet17, "onRequestGet");

// _middleware.js
var privateImplementedPaths = /* @__PURE__ */ new Set([
  "/api/school-profile",
  "/api/schools",
  "/api/schools/approve",
  "/api/schools/delete",
  "/api/auth/requests",
  "/api/auth/admin-reset-password",
  "/api/students",
  "/api/parent/children",
  "/api/subjects",
  "/api/teacher-assignments",
  "/api/marks",
  "/api/attendance",
  "/api/fees",
  "/api/announcements",
  "/api/reports",
  "/api/audit-events",
  "/api/invitations",
  "/api/users"
]);
async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) {
    return context.next();
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();
  const authEndpoint = path === "/api/auth/login" || path === "/api/auth/logout" || path === "/api/auth/me";
  if (authEndpoint) {
    return context.next();
  }
  const publicMethod = path === "/api/auth/register" && method === "POST" || path === "/api/auth/accept-invite" && method === "POST" || path === "/api/platform/bootstrap" && method === "POST" || path === "/api/schools" && method === "POST" || path === "/api/public/schools" && method === "GET" || path === "/api/health" && method === "GET" || path === "/api/public-settings" && method === "GET" || path === "/api/enquiries" && method === "POST" || path.startsWith("/api/shared-reports/") && method === "GET";
  if (publicMethod) {
    return context.next();
  }
  if (!privateImplementedPaths.has(path)) {
    return json(
      {
        error: "This API endpoint is not enabled yet. No demo or unscoped API access is allowed."
      },
      501
    );
  }
  const auth = await getAuthenticatedUser(
    request,
    env
  );
  if (!auth.user) {
    return auth.response;
  }
  return context.next();
}
__name(onRequest, "onRequest");

// ../.wrangler/tmp/pages-vRmuY6/functionsRoutes-0.39312484218413624.mjs
var routes = [
  {
    routePath: "/api/auth/accept-invite",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/auth/admin-reset-password",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/auth/login",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/auth/me",
    mountPath: "/api/auth",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/auth/register",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/auth/requests",
    mountPath: "/api/auth",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/auth/requests",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/parent/children",
    mountPath: "/api/parent",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/platform/bootstrap",
    mountPath: "/api/platform",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/api/public/schools",
    mountPath: "/api/public",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/schools/approve",
    mountPath: "/api/schools",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost7]
  },
  {
    routePath: "/api/schools/delete",
    mountPath: "/api/schools",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost8]
  },
  {
    routePath: "/api/announcements",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/api/announcements",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost9]
  },
  {
    routePath: "/api/attendance",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/api/attendance",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost10]
  },
  {
    routePath: "/api/audit-events",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet7]
  },
  {
    routePath: "/api/fees",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet8]
  },
  {
    routePath: "/api/fees",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost11]
  },
  {
    routePath: "/api/health",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet9]
  },
  {
    routePath: "/api/invitations",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet10]
  },
  {
    routePath: "/api/invitations",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost12]
  },
  {
    routePath: "/api/marks",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet11]
  },
  {
    routePath: "/api/marks",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost13]
  },
  {
    routePath: "/api/reports",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet12]
  },
  {
    routePath: "/api/school-profile",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet13]
  },
  {
    routePath: "/api/school-profile",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost14]
  },
  {
    routePath: "/api/schools",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet14]
  },
  {
    routePath: "/api/schools",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost15]
  },
  {
    routePath: "/api/subjects",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet15]
  },
  {
    routePath: "/api/subjects",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost16]
  },
  {
    routePath: "/api/teacher-assignments",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet16]
  },
  {
    routePath: "/api/teacher-assignments",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost17]
  },
  {
    routePath: "/api/users",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet17]
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest],
    modules: []
  }
];

// ../node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
