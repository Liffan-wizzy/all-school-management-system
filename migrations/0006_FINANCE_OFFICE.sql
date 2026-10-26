PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS trg_auth_parent_students_guard_insert;

-- =========================================================
-- Rebuild auth_users with FINANCE_OFFICE
-- =========================================================

CREATE TABLE auth_users_new (
  id TEXT PRIMARY KEY,
  school_id TEXT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL CHECK (
    role IN (
      'PLATFORM_ADMIN',
      'SCHOOL_ADMIN',
      'SECRETARY',
      'FINANCE_OFFICE',
      'TEACHER',
      'PARENT'
    )
  ),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id)
);

INSERT INTO auth_users_new (
  id,
  school_id,
  full_name,
  email,
  role,
  password_salt,
  password_hash,
  active,
  created_at
)
SELECT
  id,
  school_id,
  full_name,
  email,
  role,
  password_salt,
  password_hash,
  active,
  created_at
FROM auth_users;

DROP TABLE auth_users;

ALTER TABLE auth_users_new RENAME TO auth_users;

CREATE INDEX IF NOT EXISTS idx_auth_users_school
ON auth_users(school_id);


-- =========================================================
-- Rebuild registration requests with FINANCE_OFFICE
-- =========================================================

CREATE TABLE auth_registration_requests_new (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (
    role IN (
      'SECRETARY',
      'FINANCE_OFFICE',
      'TEACHER',
      'PARENT'
    )
  ),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  student_ref TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  reviewed_by TEXT REFERENCES auth_users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO auth_registration_requests_new (
  id,
  school_id,
  full_name,
  email,
  role,
  password_salt,
  password_hash,
  student_ref,
  status,
  reviewed_by,
  reviewed_at,
  created_at
)
SELECT
  id,
  school_id,
  full_name,
  email,
  role,
  password_salt,
  password_hash,
  student_ref,
  status,
  reviewed_by,
  reviewed_at,
  created_at
FROM auth_registration_requests;

DROP TABLE auth_registration_requests;

ALTER TABLE auth_registration_requests_new
RENAME TO auth_registration_requests;


-- =========================================================
-- Restore parent security trigger
-- =========================================================

CREATE TRIGGER trg_auth_parent_students_guard_insert
BEFORE INSERT ON auth_parent_students
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM auth_users u
    WHERE u.id = NEW.parent_user_id
      AND u.role = 'PARENT'
      AND CAST(u.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
      AND u.active = 1
  )
  THEN RAISE(
    ABORT,
    'Parent link must match an active parent account in the same school'
  )
  END;
END;

PRAGMA foreign_keys = ON;