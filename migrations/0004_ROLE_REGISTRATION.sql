-- Additive role-registration workflow. Requires 0003_AUTH_AND_ACCESS.sql first.
-- Public users may request only SECRETARY, TEACHER, or PARENT access.
CREATE TABLE IF NOT EXISTS auth_registration_requests (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('SECRETARY', 'TEACHER', 'PARENT')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  student_ref TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by TEXT REFERENCES auth_users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_reg_requests_school_status
  ON auth_registration_requests(school_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_reg_requests_pending_email
  ON auth_registration_requests(email COLLATE NOCASE)
  WHERE status = 'PENDING';

-- Separate link table avoids depending on older users/parent_students schemas.
CREATE TABLE IF NOT EXISTS auth_parent_students (
  id TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  linked_by TEXT REFERENCES auth_users(id),
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_user_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_auth_parent_students_parent
  ON auth_parent_students(parent_user_id, school_id);
CREATE INDEX IF NOT EXISTS idx_auth_parent_students_student
  ON auth_parent_students(student_id, school_id);

CREATE TRIGGER IF NOT EXISTS trg_auth_parent_students_guard_insert
BEFORE INSERT ON auth_parent_students
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM auth_users u
    WHERE u.id = NEW.parent_user_id
      AND u.role = 'PARENT'
      AND CAST(u.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
      AND u.active = 1
  ) THEN RAISE(ABORT, 'Parent link must match an active parent account in the same school') END;
END;
